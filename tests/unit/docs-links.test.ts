import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const DOCS = ["README.md", "docs/go-live.md", ...readdirSync("docs/adr").filter((f) => f.endsWith(".md")).map((f) => `docs/adr/${f}`)];

/** Relative link targets (no scheme, no pure anchors) of a markdown file, without the `#fragment`. */
function relativeLinks(file: string): string[] {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1]!)
    .filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("#"))
    .map((target) => target.split("#")[0]!);
}

describe("documentation links", () => {
  it("covers the README, the go-live checklist and every ADR", () => {
    expect(DOCS).toEqual(expect.arrayContaining(["README.md", "docs/go-live.md", "docs/adr/0018-guest-sandbox-and-scheduled-maintenance.md"]));
  });

  it.each(DOCS)("every relative link in %s points at a file that exists", (file) => {
    const links = relativeLinks(file);
    const broken = links.filter((target) => !existsSync(join(dirname(file), target)));
    expect(broken).toEqual([]);
  });

  it("README links the ADR index and the go-live checklist", () => {
    const links = relativeLinks("README.md");
    expect(links).toEqual(expect.arrayContaining(["docs/adr/README.md", "docs/go-live.md", "docs/badges/coverage.svg"]));
  });

  it("the ADR index lists every record in the folder, once", () => {
    const index = readFileSync("docs/adr/README.md", "utf8");
    const records = readdirSync("docs/adr").filter((f) => /^\d{4}-.*\.md$/.test(f));
    expect(records.length).toBeGreaterThanOrEqual(18);
    for (const record of records) expect(index.split(`](${record})`).length - 1, record).toBe(1);
  });
});
