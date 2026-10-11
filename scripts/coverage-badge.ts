import { readFileSync, writeFileSync } from "node:fs";
import { linesPercent, renderBadge } from "./lib/coverage-badge";

/** Writes docs/badges/coverage.svg from the report `pnpm test:coverage` just produced. */
const summary: unknown = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));
const percent = linesPercent(summary);
writeFileSync("docs/badges/coverage.svg", renderBadge("coverage", percent));
console.log(`docs/badges/coverage.svg: ${percent}% lines`);
