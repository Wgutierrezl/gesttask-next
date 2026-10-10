const MAX_NAME_LENGTH = 120;
const FALLBACK_NAME = "download";

/** What is left of a client-supplied name once it is safe to show: last path segment, no control characters or quotes. */
function safeName(raw: string): string {
  const last = raw.slice(Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\")) + 1);
  const cleaned = last.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, MAX_NAME_LENGTH).trim();
  return cleaned === "" ? FALLBACK_NAME : cleaned;
}

/**
 * The `Content-Disposition` header of a download (RFC 6266 / RFC 5987): always `attachment`, so the browser saves the
 * file instead of rendering it, named after what the user uploaded. The name is sanitized and percent-encoded, so no
 * CR/LF, quote or separator can alter the header. Without a name the file is still forced to download.
 */
export function attachmentDisposition(fileName?: string): string {
  if (fileName === undefined) return "attachment";
  const encoded = encodeURIComponent(safeName(fileName)).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename*=UTF-8''${encoded}`;
}
