/**
 * Email parsing utilities for extracting text content from email files.
 * Supports .eml (RFC 2822), .msg (Outlook OLE2), .txt, and raw pasted email text.
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
 * Read a File object as an ArrayBuffer
 */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
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
 * Parse an Outlook .msg file (OLE2 Compound Binary format).
 * Extracts subject, sender, recipients, date, and body text by reading
 * the OLE2 directory structure and property streams.
 */
export async function parseMsgFile(file: File): Promise<string> {
  const buffer = await readFileAsArrayBuffer(file);
  const data = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Validate OLE2 magic number: D0 CF 11 E0 A1 B1 1A E1
  const magic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) {
      throw new Error("Not a valid .msg file (invalid OLE2 header)");
    }
  }

  // Read OLE2 header fields
  const sectorSize = 1 << data.getUint16(30, true); // typically 512
  const miniFatCutoff = data.getUint32(56, true); // typically 4096
  const firstDirSector = data.getInt32(48, true);
  const firstMiniFatSector = data.getInt32(60, true);
  const fatSectors: number[] = [];

  // Read FAT sector locations from header (up to 109)
  for (let i = 0; i < 109; i++) {
    const sect = data.getInt32(76 + i * 4, true);
    if (sect < 0) break; // FREESECT or ENDOFCHAIN
    fatSectors.push(sect);
  }

  // Build the FAT (File Allocation Table)
  const fat: number[] = [];
  for (const fatSect of fatSectors) {
    const offset = (fatSect + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) {
      fat.push(data.getInt32(offset + i * 4, true));
    }
  }

  // Helper to read a chain of sectors
  function readChain(startSector: number): Uint8Array {
    const chunks: Uint8Array[] = [];
    let sect = startSector;
    let safety = 0;
    while (sect >= 0 && safety < 10000) {
      const offset = (sect + 1) * sectorSize;
      chunks.push(bytes.slice(offset, offset + sectorSize));
      sect = fat[sect] ?? -1;
      safety++;
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  }

  // Read directory entries
  const dirData = readChain(firstDirSector);
  const dirView = new DataView(dirData.buffer, dirData.byteOffset, dirData.byteLength);

  interface DirEntry {
    name: string;
    type: number;
    startSector: number;
    size: number;
  }

  const entries: DirEntry[] = [];
  const entrySize = 128;
  const entryCount = Math.floor(dirData.length / entrySize);

  for (let i = 0; i < entryCount; i++) {
    const base = i * entrySize;
    const nameLen = dirView.getUint16(base + 64, true);
    if (nameLen === 0) continue;

    // Read UTF-16LE name
    let name = "";
    for (let j = 0; j < (nameLen - 2) / 2; j++) {
      name += String.fromCharCode(dirView.getUint16(base + j * 2, true));
    }

    const type = dirView.getUint8(base + 66);
    const startSector = dirView.getInt32(base + 116, true);
    const size = dirView.getUint32(base + 120, true);

    entries.push({ name, type, startSector, size });
  }

  // Build mini-stream from Root Entry
  let miniStream: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  const rootEntry = entries[0];
  if (rootEntry && rootEntry.startSector >= 0) {
    miniStream = readChain(rootEntry.startSector);
  }

  // Build mini-FAT
  const miniFat: number[] = [];
  if (firstMiniFatSector >= 0) {
    const miniFatData = readChain(firstMiniFatSector);
    const miniFatView = new DataView(miniFatData.buffer, miniFatData.byteOffset, miniFatData.byteLength);
    for (let i = 0; i < miniFatData.length / 4; i++) {
      miniFat.push(miniFatView.getInt32(i * 4, true));
    }
  }

  const miniSectorSize = 64;

  // Helper to read mini-stream chain
  function readMiniChain(startSector: number, size: number): Uint8Array {
    const result = new Uint8Array(size);
    let sect = startSector;
    let pos = 0;
    let safety = 0;
    while (sect >= 0 && pos < size && safety < 10000) {
      const offset = sect * miniSectorSize;
      const copyLen = Math.min(miniSectorSize, size - pos);
      result.set(miniStream.slice(offset, offset + copyLen), pos);
      pos += copyLen;
      sect = miniFat[sect] ?? -1;
      safety++;
    }
    return result;
  }

  // Read entry data (uses mini-stream for small entries)
  function readEntryData(entry: DirEntry): Uint8Array {
    if (entry.size < miniFatCutoff && entry.startSector >= 0) {
      return readMiniChain(entry.startSector, entry.size);
    }
    if (entry.startSector >= 0) {
      const raw = readChain(entry.startSector);
      return raw.slice(0, entry.size);
    }
    return new Uint8Array(0);
  }

  // Decode UTF-16LE bytes to string
  function decodeUtf16Le(data: Uint8Array): string {
    let result = "";
    for (let i = 0; i + 1 < data.length; i += 2) {
      const code = data[i] | (data[i + 1] << 8);
      if (code === 0) break;
      result += String.fromCharCode(code);
    }
    return result;
  }

  // MAPI property IDs we care about
  // Stream names in .msg follow pattern: __substg1.0_XXXXYYYY
  // where XXXX = property tag, YYYY = property type
  // 001F = PT_UNICODE, 001E = PT_STRING8
  const PROP_SUBJECT_W = "__substg1.0_0037001F";
  const PROP_SUBJECT_A = "__substg1.0_0037001E";
  const PROP_SENDER_NAME_W = "__substg1.0_0C1A001F";
  const PROP_SENDER_NAME_A = "__substg1.0_0C1A001E";
  const PROP_SENDER_EMAIL_W = "__substg1.0_0065001F";
  const PROP_SENDER_EMAIL_A = "__substg1.0_0065001E";
  const PROP_DISPLAY_TO_W = "__substg1.0_0E04001F";
  const PROP_DISPLAY_TO_A = "__substg1.0_0E04001E";
  const PROP_DISPLAY_CC_W = "__substg1.0_0E03001F";
  const PROP_DISPLAY_CC_A = "__substg1.0_0E03001E";
  const PROP_BODY_W = "__substg1.0_1000001F";
  const PROP_BODY_A = "__substg1.0_1000001E";

  // Build lookup map
  const entryMap = new Map<string, DirEntry>();
  for (const e of entries) {
    entryMap.set(e.name, e);
  }

  function readProp(unicodeName: string, ansiName: string): string {
    const uEntry = entryMap.get(unicodeName);
    if (uEntry && uEntry.size > 0) {
      return decodeUtf16Le(readEntryData(uEntry)).trim();
    }
    const aEntry = entryMap.get(ansiName);
    if (aEntry && aEntry.size > 0) {
      const data = readEntryData(aEntry);
      return new TextDecoder("utf-8").decode(data).trim();
    }
    return "";
  }

  const subject = readProp(PROP_SUBJECT_W, PROP_SUBJECT_A);
  const senderName = readProp(PROP_SENDER_NAME_W, PROP_SENDER_NAME_A);
  const senderEmail = readProp(PROP_SENDER_EMAIL_W, PROP_SENDER_EMAIL_A);
  const displayTo = readProp(PROP_DISPLAY_TO_W, PROP_DISPLAY_TO_A);
  const displayCc = readProp(PROP_DISPLAY_CC_W, PROP_DISPLAY_CC_A);
  const body = readProp(PROP_BODY_W, PROP_BODY_A);

  // Build output
  const parts: string[] = [];
  const sender = senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderName || senderEmail;
  if (sender) parts.push(`From: ${sender}`);
  if (displayTo) parts.push(`To: ${displayTo}`);
  if (displayCc) parts.push(`CC: ${displayCc}`);
  if (subject) parts.push(`Subject: ${subject}`);
  parts.push("");
  parts.push(sanitizeEmailText(body || "(no body text found)"));

  return parts.join("\n");
}

/**
 * Determine the type of a dropped/uploaded file and extract email text.
 */
export async function parseEmailFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".eml")) {
    return parseEmlFile(file);
  }

  if (name.endsWith(".msg")) {
    return parseMsgFile(file);
  }

  if (name.endsWith(".txt")) {
    return parseTextFile(file);
  }

  // For other file types, try reading as text
  try {
    return parseTextFile(file);
  } catch {
    throw new Error(
      `Unsupported file type: ${file.name}. Please use .eml, .msg, or .txt files, or paste the email text directly.`
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
