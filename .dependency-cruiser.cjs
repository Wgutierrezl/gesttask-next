/**
 * Architecture boundaries (REQ-NFR-01): app -> infrastructure -> application -> domain.
 * Violations of any `error` rule fail CI (`pnpm depcruise`).
 */

// Matches the zod package under a plain node_modules or a pnpm layout
// (node_modules/.pnpm/zod@x/node_modules/zod/), anchored so "not-zod" never matches.
const ZOD = "(^|/)node_modules/zod/";

// Colocated unit tests (src/**/*.test.ts) may import the test runner; production code may not.
const NOT_A_TEST = "\\.test\\.ts$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-self-contained",
      comment:
        "domain is pure TypeScript: no npm packages (not even zod: Zod schemas live in application), " +
        "no node built-ins and no outer-layer imports.",
      severity: "error",
      from: { path: "^src/domain/", pathNot: NOT_A_TEST },
      to: { pathNot: "^src/domain/" },
    },
    {
      name: "application-depends-on-domain-and-zod-only",
      comment:
        "application may import domain and zod only (no next, react, drizzle-orm or infrastructure).",
      severity: "error",
      from: { path: "^src/application/", pathNot: NOT_A_TEST },
      to: { pathNot: ["^src/(application|domain)/", ZOD] },
    },
    {
      name: "app-uses-application-and-container-only",
      comment:
        "app and components reach business logic through application and the composition root only.",
      severity: "error",
      from: { path: "^src/(app|components)/" },
      to: {
        path: "^src/(domain|infrastructure)/",
        pathNot: "^src/infrastructure/container(\\.ts|/)",
      },
    },
    {
      name: "openapi-declares-over-application-only",
      comment:
        "src/openapi declares the REST contract (operations and response schemas) over application schemas and domain " +
        "enums; it never reaches infrastructure, the web layer or React.",
      severity: "error",
      from: { path: "^src/openapi/" },
      to: { path: "^src/(infrastructure|app|components)/" },
    },
    {
      name: "infrastructure-does-not-depend-on-app",
      severity: "error",
      from: { path: "^src/infrastructure/" },
      to: { path: "^src/(app|components)/" },
    },
    {
      name: "not-to-unresolvable",
      comment: "Every import must resolve, otherwise the layer rules cannot be trusted.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: { dot: { collapsePattern: "node_modules/(?:@[^/]+/[^/]+|[^/]+)" } },
  },
};
