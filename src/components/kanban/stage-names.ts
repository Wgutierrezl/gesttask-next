const DONE_NAMES = new Set(["done", "completed", "completada", "hecho", "terminado"]);

/** True when a stage name reads like the finished column; the UI then SUGGESTS the done flag and never applies it. */
export function suggestsDone(name: string): boolean {
  return DONE_NAMES.has(name.trim().toLowerCase());
}
