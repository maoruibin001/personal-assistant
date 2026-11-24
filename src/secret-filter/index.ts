/** Shared, I/O-free credential filtering for browse/export/trace consumers. */
import { redact, secretMatches } from "../ingest/redact.js";
import { SECRET_FILTER_POLICY_SHA256, SECRET_FILTER_RULES as rules } from "./rules.generated.js";

export { SECRET_FILTER_POLICY_SHA256, SECRET_FILTER_RULES } from "./rules.generated.js";
export type SecretSurface = "browse" | "export" | "trace";
export type SecretJson = null | boolean | number | string | SecretJson[] | { [key: string]: SecretJson };
export interface SecretFilterResult {
  surface: SecretSurface;
  policySha256: string;
  value: SecretJson;
  excluded: boolean;
  droppedFiles: number;
  droppedFields: number;
  redactions: Record<string, number>;
}

const segments = rules.fileSegmentPatterns.map((source) => new RegExp(source));
const suffixes = rules.fieldSuffixPatterns.map((source) => new RegExp(source));
const normalizeField = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
const fields = new Set<string>(rules.fieldNames.map(normalizeField));
const pathFields = new Set<string>(rules.pathFieldNames.map(normalizeField));

/** Logical filename check only. Call before opening files or traversing a directory. */
export function isSecretPath(input: unknown): boolean {
  if (typeof input !== "string" || !input || input.length > rules.limits.maxPathUnits || /[\u0000-\u001f\u007f]/.test(input)) return true;
  if (Object.keys(secretMatches(input)).length) return true;
  let path = input.split(/[?#]/, 1)[0].normalize("NFKC");
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
  } catch { return true; }
  if (/%[0-9a-f]{2}/i.test(path)) return true;
  if (/[\u0000-\u001f\u007f]/.test(path)) return true;
  path = path.normalize("NFKC").toLowerCase().replace(/\\/g, "/");
  return path.split("/").some((part) => part === ".." || segments.some((pattern) => pattern.test(part)));
}

export function isSecretField(input: unknown): boolean {
  if (typeof input !== "string" || input.length > rules.limits.maxPathUnits) return true;
  const name = normalizeField(input);
  return fields.has(name) || suffixes.some((pattern) => pattern.test(name)) || Object.keys(secretMatches(input)).length > 0;
}

const DROP = Symbol("credential input excluded");
const dataField = (value: object, key: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !Object.hasOwn(descriptor, "value")) throw Error("Secret-filter refuses accessors");
  return descriptor?.value;
};

export function filterSecrets(surface: SecretSurface, input: unknown): SecretFilterResult {
  if (!(rules.surfaces as readonly string[]).includes(surface)) throw Error("Unsupported secret-filter surface");
  const result: SecretFilterResult = { surface, policySha256: SECRET_FILTER_POLICY_SHA256, value: null, excluded: false, droppedFiles: 0, droppedFields: 0, redactions: {} };
  const active = new Set<object>();
  let nodes = 0;
  const visit = (value: unknown, depth: number): SecretJson | typeof DROP => {
    if (++nodes > rules.limits.maxNodes || depth > rules.limits.maxDepth) throw Error("Secret-filter input exceeds structural limits");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      if (value.length > rules.limits.maxStringUnits) throw Error("Secret-filter text exceeds limit");
      const masked = redact(value);
      for (const [kind, n] of Object.entries(masked.counts)) result.redactions[kind] = (result.redactions[kind] ?? 0) + n;
      return masked.text;
    }
    if (typeof value !== "object" || !value || active.has(value)) throw Error("Secret-filter accepts finite, acyclic JSON only");
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw Error("Secret-filter accepts plain JSON objects only");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some((entry) => !Object.hasOwn(entry, "value"))) throw Error("Secret-filter refuses accessors");
    active.add(value);
    try {
      if (Array.isArray(value)) {
        const output: SecretJson[] = [];
        for (const item of value) { const clean = visit(item, depth + 1); if (clean !== DROP) output.push(clean); }
        return output;
      }
      const object = value as Record<string, unknown>;
      const pathRefs = Object.entries(object).filter(([key]) => pathFields.has(normalizeField(key))).map(([, item]) => item);
      if (surface === "trace" && Object.hasOwn(object, "traceId")) {
        const detail = object.detailRef, outcome = object.result;
        if (detail && typeof detail === "object") pathRefs.push(dataField(detail, "path"));
        if (outcome && typeof outcome === "object") pathRefs.push(dataField(outcome, "artifactRef"));
      }
      if (pathRefs.some((path) => typeof path === "string" && isSecretPath(path))) { result.droppedFiles++; return DROP; }
      const output: { [key: string]: SecretJson } = {};
      for (const [key, item] of Object.entries(object)) {
        if (isSecretField(key)) { result.droppedFields++; continue; }
        if (isSecretPath(key)) { result.droppedFiles++; continue; }
        const clean = visit(item, depth + 1);
        if (clean !== DROP) Object.defineProperty(output, key, { value: clean, enumerable: true, writable: true, configurable: true });
      }
      return output;
    } finally { active.delete(value); }
  };
  const value = visit(input, 0);
  result.excluded = value === DROP;
  result.value = value === DROP ? null : value;
  return result;
}

/** Synchronous adapter: a blocked filename never reaches the supplied reader. */
export function filterSecretFile(surface: SecretSurface, path: string, read: () => unknown): SecretFilterResult {
  if (!(rules.surfaces as readonly string[]).includes(surface)) throw Error("Unsupported secret-filter surface");
  if (isSecretPath(path)) return { surface, policySha256: SECRET_FILTER_POLICY_SHA256, value: null, excluded: true, droppedFiles: 1, droppedFields: 0, redactions: {} };
  return filterSecrets(surface, { path, content: read() });
}
