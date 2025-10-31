export function redact<T>(input: T): T {
  const s = JSON.stringify(input);
  const masked = s
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "redacted_email@example.com")
    .replace(/\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "redacted_phone")
    .replace(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g, "PersonX");
  return JSON.parse(masked);
}
