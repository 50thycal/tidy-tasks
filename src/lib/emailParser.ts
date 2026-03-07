/**
 * Email parsing utilities for extracting text content from email files.
 * Supports .eml (RFC 2822), .txt, and raw pasted email text.
 */

/**
 * Read a File object as text
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}

/**
 * Parse an .eml file (RFC 2822 format) and extract the plain text body.
 * Handles basic MIME multipart and quoted-printable decoding.
 */
export async function parseEmlFile(file: File): Promise<string> {
  const raw = await readFileAsText(file);
  return extractEmailText(raw);
}

/**
 * Parse a .txt file as email text (used as-is).
 */
export async function parseTextFile(file: File): Promise<string> {
  const raw = await readFileAsText(file);
  return sanitizeEmailText(raw);
}

/**
 * Extract useful text from raw email content (headers + body).
 * Preserves From/To/Subject/Date headers and extracts the plain text body.
 */
export function extractEmailText(raw: string): string {
  // Split headers from body at first blank line
  const headerBodySplit = raw.indexOf("\r\n\r\n");
  const altSplit = raw.indexOf("\n\n");
  const splitIndex = headerBodySplit !== -1 ? headerBodySplit : altSplit;

  if (splitIndex === -1) {
    // No clear header/body split — treat entire content as body
    return sanitizeEmailText(raw);
  }

  const headerSection = raw.substring(0, splitIndex);
  const bodySection = raw.substring(
    splitIndex + (headerBodySplit !== -1 ? 4 : 2)
  );

  // Extract key headers
  const headers = parseHeaders(headerSection);
  const from = headers["from"] || "";
  const to = headers["to"] || "";
  const subject = headers["subject"] || "";
  const date = headers["date"] || "";
  const cc = headers["cc"] || "";

  // Check if this is multipart MIME
  const contentType = headers["content-type"] || "";
  let plainBody = bodySection;

  if (contentType.includes("multipart")) {
    // Extract boundary
    const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);
    if (boundaryMatch) {
      plainBody = extractPlainTextPart(bodySection, boundaryMatch[1]);
    }
  }

  // Decode quoted-printable if needed
  const encoding = headers["content-transfer-encoding"] || "";
  if (encoding.toLowerCase().includes("quoted-printable")) {
    plainBody = decodeQuotedPrintable(plainBody);
  }

  // Build a clean representation
  const parts: string[] = [];
  if (from) parts.push(`From: ${from}`);
  if (to) parts.push(`To: ${to}`);
  if (cc) parts.push(`CC: ${cc}`);
  if (date) parts.push(`Date: ${date}`);
  if (subject) parts.push(`Subject: ${subject}`);
  parts.push(""); // blank line separator
  parts.push(sanitizeEmailText(plainBody));

  return parts.join("\n");
}

/**
 * Parse email headers into a key-value map (lowercase keys).
 * Handles header continuation (lines starting with whitespace).
 */
function parseHeaders(headerSection: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headerSection.split(/\r?\n/);
  let currentKey = "";

  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // Continuation of previous header
      if (currentKey) {
        headers[currentKey] += " " + line.trim();
      }
    } else {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        currentKey = line.substring(0, colonIndex).toLowerCase().trim();
        headers[currentKey] = line.substring(colonIndex + 1).trim();
      }
    }
  }

  return headers;
}

/**
 * Extract the text/plain part from a multipart MIME body.
 */
function extractPlainTextPart(body: string, boundary: string): string {
  const parts = body.split(`--${boundary}`);

  for (const part of parts) {
    // Look for text/plain content type
    const headerEnd = part.indexOf("\r\n\r\n");
    const altEnd = part.indexOf("\n\n");
    const end = headerEnd !== -1 ? headerEnd : altEnd;

    if (end === -1) continue;

    const partHeaders = part.substring(0, end).toLowerCase();
    if (
      partHeaders.includes("text/plain") ||
      (!partHeaders.includes("text/html") && !partHeaders.includes("content-type"))
    ) {
      let content = part.substring(end + (headerEnd !== -1 ? 4 : 2));

      // Check for quoted-printable in this part
      if (partHeaders.includes("quoted-printable")) {
        content = decodeQuotedPrintable(content);
      }

      return content.trim();
    }
  }

  // Fallback: if no text/plain found, try to strip HTML from first text/html part
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    const altEnd = part.indexOf("\n\n");
    const end = headerEnd !== -1 ? headerEnd : altEnd;

    if (end === -1) continue;

    const partHeaders = part.substring(0, end).toLowerCase();
    if (partHeaders.includes("text/html")) {
      let content = part.substring(end + (headerEnd !== -1 ? 4 : 2));
      if (partHeaders.includes("quoted-printable")) {
        content = decodeQuotedPrintable(content);
      }
      return stripHtml(content);
    }
  }

  // Last resort: return the whole body
  return body;
}

/**
 * Decode quoted-printable encoding.
 */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "") // Remove soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Basic HTML tag stripping for fallback HTML-to-text conversion.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Clean up email text by removing noise (signatures, disclaimers, excessive whitespace).
 */
export function sanitizeEmailText(text: string): string {
  let cleaned = text;

  // Remove common email signature markers and everything after
  const sigMarkers = [
    /^--\s*$/m, // standard sig separator
    /^_{3,}$/m, // underscores
    /^Sent from my /m,
    /^Get Outlook for /m,
  ];

  for (const marker of sigMarkers) {
    const match = cleaned.match(marker);
    if (match && match.index !== undefined) {
      // Only cut if the signature is in the last 30% of the text
      if (match.index > cleaned.length * 0.7) {
        cleaned = cleaned.substring(0, match.index);
      }
    }
  }

  // Collapse excessive whitespace
  cleaned = cleaned.replace(/[ \t]+$/gm, ""); // trailing whitespace per line
  cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n"); // max 3 consecutive newlines

  return cleaned.trim();
}

/**
 * Determine the type of a dropped/uploaded file and extract email text.
 */
export async function parseEmailFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".eml")) {
    return parseEmlFile(file);
  }

  if (name.endsWith(".txt")) {
    return parseTextFile(file);
  }

  // For other file types, try reading as text
  try {
    return parseTextFile(file);
  } catch {
    throw new Error(
      `Unsupported file type: ${file.name}. Please use .eml or .txt files, or paste the email text directly.`
    );
  }
}

/**
 * Check if a file is a supported email format.
 */
export function isSupportedEmailFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".eml") || name.endsWith(".txt") || name.endsWith(".msg");
}
