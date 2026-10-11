/** A smallest valid PNG: one opaque pixel. Stands in for a design sketch. */
const PIXEL_PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);

const OUTLINE = new TextEncoder().encode(
  ["Launch announcement: outline", "", "1. What ships", "2. Why it matters", "3. How to try it", "4. What comes next", ""].join("\n"),
);

export interface DemoFile {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

/** The files the demo comments carry. Both pass the attachment policy (type and size). */
export const DEMO_FILES = {
  outline: { fileName: "announcement-outline.txt", contentType: "text/plain", bytes: OUTLINE },
  sketch: { fileName: "widgets-sketch.png", contentType: "image/png", bytes: PIXEL_PNG },
} as const satisfies Record<string, DemoFile>;

export type DemoFileId = keyof typeof DEMO_FILES;
