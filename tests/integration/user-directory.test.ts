import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleUserDirectory } from "@/infrastructure/auth/drizzle-user-directory";
import { user } from "@/infrastructure/db/schema";
import { connectTestDb, resetDb } from "./support/db";

const handle = connectTestDb();
const directory = new DrizzleUserDirectory(handle.db);

beforeEach(async () => {
  await resetDb(handle);
  await handle.db.insert(user).values([
    { id: "ada", name: "Ada", email: "ada@example.com" },
    { id: "anon", name: "Anonymous", email: "temp-1@example.com", isAnonymous: true },
    { id: "demo-owner", name: "Demo Owner", email: "demo-owner@demo.invalid" },
  ]);
});
afterAll(() => handle.close());

describe("DrizzleUserDirectory", () => {
  it("finds registered accounts by email, ignoring case", async () => {
    expect(await directory.findByEmail("ADA@Example.com")).toEqual({ id: "ada", name: "Ada", email: "ada@example.com" });
    expect(await directory.findByEmail("nobody@example.com")).toBeNull();
  });

  it("never offers demo-session or seeded demo accounts for invitation", async () => {
    expect(await directory.findByEmail("temp-1@example.com")).toBeNull();
    expect(await directory.findByEmail("demo-owner@demo.invalid")).toBeNull();
  });

  it("shows names for everyone but emails only for registered accounts", async () => {
    const profiles = await directory.findByIds(["ada", "anon", "demo-owner", "missing"]);
    expect(profiles.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: "ada", name: "Ada", email: "ada@example.com" },
      { id: "anon", name: "Anonymous", email: null },
      { id: "demo-owner", name: "Demo Owner", email: null },
    ]);
    expect(await directory.findByIds([])).toEqual([]);
  });
});
