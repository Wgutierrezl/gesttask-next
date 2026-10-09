/** Post-login destination from a query parameter: same-site relative paths only, never an open redirect. */
export function safeNext(value: FormDataEntryValue | string | string[] | null | undefined, fallback = "/boards"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
