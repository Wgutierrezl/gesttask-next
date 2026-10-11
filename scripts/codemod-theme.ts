import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { codemodWarnings, migrateTheme } from "./lib/theme-codemod";

/** Rewrites raw palette utilities to semantic tokens in the given files or directories (.ts and .tsx, tests skipped); scrims are reported, never rewritten. */
function sources(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { recursive: true, encoding: "utf8" })
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
    .map((name) => join(path, name));
}

let changed = 0;
for (const file of process.argv.slice(2).flatMap(sources)) {
  const before = readFileSync(file, "utf8");
  for (const warning of codemodWarnings(before)) console.warn(`${file}: ${warning}`);
  const after = migrateTheme(before);
  if (after === before) continue;
  writeFileSync(file, after);
  changed += 1;
  console.log(file);
}
console.log(`${changed} file(s) rewritten`);
