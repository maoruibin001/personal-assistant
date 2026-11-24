export const secretPatterns: [string, RegExp][] = [
  [
    "private_key",
    /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g,
  ],
  [
    "url_credentials",
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@<>"'\\]+:[^\s/@<>"'\\]*@/gi,
  ],
  ["bearer", /\bBearer\s+[A-Za-z0-9_.~+\/-]{6,}=*/gi],
  ["sk_token", /\bsk-[A-Za-z0-9_-]{8,}/g],
  [
    "github_token",
    /\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})/g,
  ],
  ["gitlab_token", /\bglpat-[A-Za-z0-9_-]{8,}/g],
  ["aws_key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
  [
    "credential_assignment",
    /\b(?:aws_secret_access_key|awsSecretAccessKey|secret_access_key|api[_-]?key|access[_-]?token|client[_-]?secret|refresh[_-]?token)\s*[=:]\s*["']?[A-Za-z0-9_+\/.=-]{8,}["']?/gi,
  ],
  [
    "url_secret",
    /([?&](?:token|api_key|access_token|key|secret|password|signature)=)[^\s&#"'<>\[\\]+/gi,
  ],
];
export function redact(text: string) {
  const counts: Record<string, number> = {};
  // Later replacements can remove whitespace inside an earlier pattern (e.g. a Bearer value in URL userinfo).
  // Iterate to a fixed point; placeholders themselves never match the patterns.
  for (let pass = 0; pass <= secretPatterns.length; pass++) {
    let replaced = false;
    for (const [kind, pattern] of secretPatterns) {
      pattern.lastIndex = 0;
      text = text.replace(pattern, (match, prefix) => {
        replaced = true;
        counts[kind] = (counts[kind] ?? 0) + 1;
        if (kind === "url_credentials")
          return (
            match.slice(0, match.indexOf("://") + 3) +
            "[REDACTED_URL_CREDENTIALS]@"
          );
        if (kind === "url_secret") return prefix + "[REDACTED:URL_SECRET]";
        return `[REDACTED:${kind.toUpperCase()}]`;
      });
    }
    if (!replaced) return { text, counts };
  }
  throw Error("Secret masking did not converge; output refused");
}
export function secretMatches(text: string) {
  const counts: Record<string, number> = {};
  for (const [kind, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    const n = [...text.matchAll(pattern)].length;
    if (n) counts[kind] = n;
  }
  return counts;
}
