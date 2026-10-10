import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const APP = join(process.cwd(), "src/app");
const walk = (dir: string): string[] =>
  (readdirSync(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
const rel = (file: string) => file.slice(APP.length + 1);

/** Server Actions that run before a session exists. Everything else under `_actions` must be guarded. */
const PUBLIC_ACTION_FILES = ["_actions/auth.ts"];

describe("authorization guards are present everywhere", () => {
  it("calls requirePageActor in every page and data loader under (app)", () => {
    const guarded = walk(join(APP, "(app)")).filter((file) => /(^|\/)(page|loader|loaders)\.tsx?$|\.loader\.tsx?$/.test(file));
    expect(guarded.map(rel)).toEqual(
      expect.arrayContaining(["(app)/boards/page.tsx", "(app)/boards/[boardId]/page.tsx", "(app)/boards/[boardId]/settings/page.tsx"]),
    );
    for (const file of guarded) expect(readFileSync(file, "utf8"), rel(file)).toMatch(/\brequire(Page)?Actor\(/);
  });

  it("guards the (app) layout too, and every page is force-dynamic through it", () => {
    const layout = readFileSync(join(APP, "(app)/layout.tsx"), "utf8");
    expect(layout).toMatch(/\brequirePageActor\(/);
    expect(layout).toMatch(/dynamic = "force-dynamic"/);
  });

  it("keeps pages from reading data any other way than the container's guarded use cases", () => {
    for (const file of walk(join(APP, "(app)")).filter((f) => /page\.tsx$/.test(f))) {
      const source = readFileSync(file, "utf8");
      expect(source, rel(file)).not.toMatch(/\bmake[A-Z]\w+\(|infrastructure\/(?!container)/);
    }
  });

  it("keeps server-only code out of components: they cannot import the container, actions' helpers or infrastructure", () => {
    const components = walk(join(process.cwd(), "src/components")).filter((f) => /\.tsx?$/.test(f));
    expect(components.length).toBeGreaterThan(10);
    for (const file of components) {
      // Bound Server Actions hang on Next 16's no-JavaScript form post: pass ids in hidden fields instead.
      expect(readFileSync(file, "utf8"), `${file} binds a server action`).not.toMatch(/\.bind\(null/);
      const imports = [...readFileSync(file, "utf8").matchAll(/^import (?!type\b)[^;]*from "([^"]+)"/gm)].map((m) => m[1]!);
      for (const target of imports) {
        expect(target, `${file} imports ${target}`).not.toMatch(/infrastructure|_shared\/(run-mutation|load-page|require-page-actor)/);
      }
    }
  });

  it("guards every non-public Server Action: it reaches data only through the container's session-bound use cases", () => {
    const actions = walk(join(APP, "_actions")).filter((file) => /\.tsx?$/.test(file) && !PUBLIC_ACTION_FILES.includes(rel(file)));
    expect(actions.map(rel)).toEqual(expect.arrayContaining(["_actions/boards.ts"]));
    for (const file of actions) {
      const source = readFileSync(file, "utf8");
      expect(source, rel(file)).toMatch(/\b(withActor|requireActor|requirePageActor)\b|\.useCases\./);
      expect(source, `${rel(file)} must not use a raw use-case factory`).not.toMatch(/\bmake[A-Z]\w+\(/);
    }
  });

  it("guards every non-public Server Action file with the 'use server' directive", () => {
    const actions = walk(join(APP, "_actions")).filter((file) => /\.tsx?$/.test(file));
    for (const file of actions) expect(readFileSync(file, "utf8").trimStart(), rel(file)).toMatch(/^"use server";/);
  });

  it("keeps the public actions list honest: those files exist", () => {
    for (const file of PUBLIC_ACTION_FILES) expect(() => readFileSync(join(APP, file), "utf8")).not.toThrow();
  });
});

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
vi.mock("next/navigation", () => ({ redirect }));
const getActor = vi.fn();
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor } }) }));

beforeEach(() => vi.clearAllMocks());

describe("requirePageActor", () => {
  it("returns the actor, or sends a visitor without a valid session to the login page", async () => {
    const { requirePageActor } = await import("@/app/_shared/require-page-actor");
    getActor.mockResolvedValue({ userId: "u", isGuest: false });
    await expect(requirePageActor()).resolves.toEqual({ userId: "u", isGuest: false });
    getActor.mockResolvedValue(null);
    await expect(requirePageActor()).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });
});

describe("login and register pages", () => {
  const search = (next?: string) => Promise.resolve({ next });

  it("send signed-in real users on, but still show the form to guests so they can upgrade", async () => {
    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    for (const Page of [LoginPage, RegisterPage]) {
      getActor.mockResolvedValue({ userId: "g", isGuest: true });
      await expect(Page({ searchParams: search() })).resolves.toBeTruthy();
      expect(redirect).not.toHaveBeenCalled();
      getActor.mockResolvedValue({ userId: "u", isGuest: false });
      await expect(Page({ searchParams: search("/boards/1") })).rejects.toMatchObject({ digest: expect.stringContaining("/boards/1") });
      getActor.mockResolvedValue(null);
      await expect(Page({ searchParams: search() })).resolves.toBeTruthy();
      vi.clearAllMocks();
    }
  });
});
