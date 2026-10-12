/** A pipeline never has more stages than this (at creation, and when one is added later): a board that wide stops being readable. Plain constant so the UI can share it without pulling in Zod. */
export const MAX_STAGES = 20;
