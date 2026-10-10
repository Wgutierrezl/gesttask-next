/** "1.5 KB", "5.0 MB": a file size for people. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Where the browser downloads an attachment: the app checks access, then redirects to a short-lived signed URL. */
export const attachmentDownloadPath = (attachmentId: string): string => `/api/attachments/${attachmentId}/download`;
