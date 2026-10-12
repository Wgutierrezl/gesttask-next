import { INTL_LOCALE, type Locale } from "@/i18n/config";

const ONE_DECIMAL = Object.fromEntries(
  (Object.keys(INTL_LOCALE) as Locale[]).map((locale) => [locale, new Intl.NumberFormat(INTL_LOCALE[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })]),
) as Record<Locale, Intl.NumberFormat>;

/** "1.5 KB", "5.0 MB" (es: "1,5 KB"): a file size for people. */
export function formatBytes(bytes: number, locale: Locale): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${ONE_DECIMAL[locale].format(bytes / 1024)} KB`;
  return `${ONE_DECIMAL[locale].format(bytes / (1024 * 1024))} MB`;
}

/** Where the browser downloads an attachment: the app checks access, then redirects to a short-lived signed URL. */
export const attachmentDownloadPath = (attachmentId: string): string => `/api/attachments/${attachmentId}/download`;
