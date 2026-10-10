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
      expect.arrayContaining([
        "(app)/boards/page.tsx",
        "(app)/boards/[boardId]/page.tsx",
        "(app)/boards/[boardId]/settings/page.tsx",
        "(app)/boards/[boardId]/pipelines/[pipelineId]/page.tsx",
        "(app)/boards/[boardId]/pipelines/[pipelineId]/tasks/[taskId]/page.tsx",
      ]),
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
        expect(target, `${file} imports ${target}`).not.toMatch(
          /infrastructure|@\/application\/use-cases|^next\/headers$|^server-only$|_shared\/(run-mutation|load-page|require-page-actor)/,
        );
      }
    }
  });

  it("keeps raw positions out of the Kanban components: moves are always relative to another task", () => {
    const kanban = walk(join(process.cwd(), "src/components/kanban")).filter((f) => /\.tsx?$/.test(f));
    expect(kanban.length).toBeGreaterThan(15);
    const clients = kanban.filter((f) => readFileSync(f, "utf8").trimStart().startsWith('"use client"'));
    expect(clients.length).toBeGreaterThan(8);
    for (const file of kanban) {
      const source = readFileSync(file, "utf8");
      // Moves are expressed as "after this task"; a position string must never be built or sent by the browser.
      expect(source, `${file} handles a raw position`).not.toMatch(/\bposition\s*[:=]|generateKeyBetween|fractional/i);
    }
  });

  it("guards every non-public Server Action: it reaches data only through the container's session-bound use cases", () => {
    const actions = walk(join(APP, "_actions")).filter((file) => /\.tsx?$/.test(file) && !PUBLIC_ACTION_FILES.includes(rel(file)));
    expect(actions.map(rel)).toEqual(expect.arrayContaining(["_actions/boards.ts", "_actions/stages.ts", "_actions/tasks.ts", "_actions/comments.ts", "_actions/uploads.ts"]));
    for (const file of actions) {
      const source = readFileSync(file, "utf8");
      expect(source, rel(file)).toMatch(/\b(withActor|requireActor|requirePageActor)\b|\.useCases\./);
      expect(source, `${rel(file)} must not use a raw use-case factory`).not.toMatch(/\bmake[A-Z]\w+\(/);
    }
  });

  it("guards each exported action individually and limits what actions take from the container", () => {
    const actions = walk(join(APP, "_actions")).filter((file) => /\.tsx?$/.test(file) && !PUBLIC_ACTION_FILES.includes(rel(file)));
    let exported = 0;
    for (const file of actions) {
      const source = readFileSync(file, "utf8");
      const bodies = source.split(/^export (?=async function )/m).slice(1);
      expect(bodies.length, `${rel(file)} exports no action`).toBeGreaterThan(0);
      expect(source.match(/^export /gm)?.length, `${rel(file)} may export only async functions`).toBe(bodies.length);
      for (const body of bodies) {
        exported += 1;
        expect(body, `${rel(file)}: ${body.slice(0, 40)}`).toMatch(/\bgetContainer\(\)\.useCases\./);
        expect(body, `${rel(file)}: ${body.slice(0, 40)}`).toMatch(/\brunMutation(Data)?\(/);
      }
      // Actions may touch only the guarded use cases, the logger and the current user's id: never repos, auth or db.
      for (const use of source.matchAll(/getContainer\(\)(\.\w+(?:\.\w+)?)?/g)) {
        expect(use[1], `${rel(file)}: ${use[0]}`).toMatch(/^\.(useCases|logger|session\.getActor)$|^\.useCases/);
      }
    }
    expect(exported).toBeGreaterThanOrEqual(23);
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
