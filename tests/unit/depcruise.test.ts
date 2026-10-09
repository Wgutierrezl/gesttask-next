import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { cruise, type ICruiseResult, type IViolation } from "dependency-cruiser";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const ruleSet = require("../../.dependency-cruiser.cjs") as Record<string, unknown>;

async function violationsIn(fixture: "valid" | "violations"): Promise<IViolation[]> {
  const baseDir = fileURLToPath(new URL(`../fixtures/depcruise/${fixture}`, import.meta.url));
  const result = await cruise(["src"], {
    baseDir,
    ruleSet,
    validate: true,
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
  } as never,
  // Real tsConfig so the `@/` alias resolves exactly as it does in the project.
  { tsConfig: `${baseDir}/tsconfig.json` } as never);
  return (result.output as ICruiseResult).summary.violations;
}

function ruleNamesFor(violations: IViolation[], fromFile: string): string[] {
  return violations.filter((v) => v.from.endsWith(fromFile)).map((v) => v.rule.name);
}

describe("dependency boundaries", () => {
  it("accepts the allowed dependency directions", async () => {
    expect(await violationsIn("valid")).toEqual([]);
  });

  describe("domain", () => {
    it("rejects third-party imports", async () => {
      const violations = await violationsIn("violations");
      expect(ruleNamesFor(violations, "domain/uses-drizzle.ts")).toContain("domain-is-self-contained");
    });

    it("rejects node built-ins", async () => {
      const violations = await violationsIn("violations");
      expect(ruleNamesFor(violations, "domain/uses-node-builtin.ts")).toContain(
        "domain-is-self-contained",
      );
    });

    it("rejects outer-layer imports made through the @/ alias", async () => {
      const violations = await violationsIn("violations");
      expect(ruleNamesFor(violations, "domain/uses-alias.ts")).toContain("domain-is-self-contained");
    });

    it("rejects imports that cannot be resolved", async () => {
      const violations = await violationsIn("violations");
      expect(ruleNamesFor(violations, "domain/uses-missing.ts")).toContain("not-to-unresolvable");
    });

    it("lets colocated test files import the test runner", async () => {
      const violations = await violationsIn("valid");
      expect(ruleNamesFor(violations, "domain/priority.test.ts")).toEqual([]);
      expect(ruleNamesFor(violations, "application/schema.test.ts")).toEqual([]);
    });

    it("rejects imports from outer layers", async () => {
      const violations = await violationsIn("violations");
      expect(ruleNamesFor(violations, "domain/uses-application.ts")).toContain(
        "domain-is-self-contained",
      );
    });
  });

  describe("application", () => {
    it("rejects next, react and infrastructure", async () => {
      const violations = await violationsIn("violations");
      expect(ruleNamesFor(violations, "application/uses-next.ts")).toContain(
        "application-depends-on-domain-and-zod-only",
      );
      expect(ruleNamesFor(violations, "application/uses-react.ts")).toContain(
        "application-depends-on-domain-and-zod-only",
      );
      expect(ruleNamesFor(violations, "application/uses-infrastructure.ts")).toContain(
        "application-depends-on-domain-and-zod-only",
      );
    });
  });

  describe("app", () => {
    it("rejects direct infrastructure imports other than the container", async () => {
      const violations = await violationsIn("violations");
      expect(ruleNamesFor(violations, "app/uses-repo.ts")).toContain(
        "app-uses-application-and-container-only",
      );
    });
  });
});
