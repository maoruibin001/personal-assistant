const LOCAL = /https?:\/\/(?:127\.0\.0\.1|localhost)[^\s)]*|(?:\/Users|~)\/[^\s)]+/;
const URL = /https?:\/\/[^\s)]+/g;
const HASH = /(?<![\w/.-])[0-9a-f]{8,}(?![\w/.-])/;
const TICKET = /(?<![A-Za-z])(?:D\d{2}(?:-\d{1,2})?|JD-\d{2}|OPS-[A-Z]+|RQ-\d{6,}|U-\d{2,3}|P\d{2})(?!\w)/;
const JARGON = /\b(?:etag|sourceFresh|transport status|claim lease|commit hash)\b/i;

export const PLAIN_LIMIT = 400;
export const PLAIN_GUIDE =
  "Lead with the conclusion, use short sentences and at most three points. Keep useful option labels such as 1-A. Omit internal identifiers, local paths and jargon.";

export function plainViolations(text: string, limit = PLAIN_LIMIT): string[] {
  const body = text.replace(URL, "");
  const found: string[] = [];
  if (text.length > limit) found.push("Reply exceeds the character limit");
  if (LOCAL.test(text)) found.push("Contains a local URL or filesystem path");
  if (HASH.test(body) || TICKET.test(body)) found.push("Contains an internal identifier");
  if (JARGON.test(body)) found.push("Contains internal terminology");
  return found;
}
