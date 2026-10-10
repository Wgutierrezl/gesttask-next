import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@/domain/errors";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { InMemoryUserDirectory } from "@/infrastructure/repos/in-memory-users";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, STRANGER, actor, seedBoard } from "@tests/support/fixtures";
import { makeGetBoard } from "../boards/get-board";
import { makeAddMemberByEmail } from "./add-member-by-email";
import { makeListMemberProfiles } from "./list-member-profiles";

describe("board detail and member directory", () => {
  let ctx: TestContext;
  let users: InMemoryUserDirectory;
  let boardId: string;
  beforeEach(async () => {
    ctx = createTestContext();
    users = new InMemoryUserDirectory([
      { id: "owner", name: "Olivia Owner", email: "olivia@example.com" },
      { id: "member", name: "Mark Member", email: "mark@example.com" },
      { id: "carol", name: "Carol", email: "carol@example.com" },
      { id: "guest", name: "Anonymous", email: null },
    ]);
    ({ boardId } = await seedBoard(ctx));
  });

  describe("getBoard", () => {
    it("returns the board with the caller's own role", async () => {
      expect(await makeGetBoard(ctx)(OWNER, { boardId })).toMatchObject({ board: { id: boardId, name: "Board" }, role: "owner" });
      expect((await makeGetBoard(ctx)(MEMBER, { boardId })).role).toBe("member");
      expect((await makeGetBoard(ctx)(GUEST, { boardId })).role).toBe("guest");
    });

    it("answers NotFound to non-members and for unknown ids, and Validation to malformed ones", async () => {
      await expect(makeGetBoard(ctx)(STRANGER, { boardId })).rejects.toBeInstanceOf(NotFoundError);
      await expect(makeGetBoard(ctx)(OWNER, { boardId: "00000000-0000-4000-8000-00000000ffff" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(makeGetBoard(ctx)(OWNER, { boardId: "nope" })).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("listMemberProfiles", () => {
    it("joins memberships with names and, for owners, emails; anonymous accounts have no email", async () => {
      const profiles = await makeListMemberProfiles(ctx, users)(OWNER, { boardId });
      expect(profiles).toEqual([
        { userId: "guest", role: "guest", name: "Anonymous", email: null },
        { userId: "member", role: "member", name: "Mark Member", email: "mark@example.com" },
        { userId: "owner", role: "owner", name: "Olivia Owner", email: "olivia@example.com" },
      ]);
    });

    it.each([MEMBER, GUEST])("shows names but never emails to a non-owner (%o)", async (viewer) => {
      const profiles = await makeListMemberProfiles(ctx, users)(viewer, { boardId });
      expect(profiles.map((p) => p.name)).toEqual(["Anonymous", "Mark Member", "Olivia Owner"]);
      expect(profiles.map((p) => p.email)).toEqual([null, null, null]);
    });

    it("pages the members", async () => {
      const profiles = await makeListMemberProfiles(ctx, users)(OWNER, { boardId, limit: 1, offset: 1 });
      expect(profiles.map((p) => p.userId)).toEqual(["member"]);
    });

    it("looks up just the members asked for, however many the board has, skipping people who are not members", async () => {
      const profiles = await makeListMemberProfiles(ctx, users)(MEMBER, { boardId, userIds: ["owner", "carol", "nobody", "owner"] });
      expect(profiles).toEqual([{ userId: "owner", role: "owner", name: "Olivia Owner", email: null }]);
      expect(await makeListMemberProfiles(ctx, users)(OWNER, { boardId, userIds: [] })).toEqual([]);
    });

    it("keeps the privacy and access rules when looking members up by id", async () => {
      const [owned] = await makeListMemberProfiles(ctx, users)(OWNER, { boardId, userIds: ["member"] });
      expect(owned?.email).toBe("mark@example.com");
      await expect(makeListMemberProfiles(ctx, users)(STRANGER, { boardId, userIds: ["owner"] })).rejects.toBeInstanceOf(NotFoundError);
      await expect(makeListMemberProfiles(ctx, users)(OWNER, { boardId, userIds: Array.from({ length: 201 }, (_v, i) => `u${i}`) })).rejects.toBeInstanceOf(ValidationError);
    });

    it("labels a member whose account no longer exists", async () => {
      await ctx.repos.members.insert({ boardId, userId: "ghost", role: "member" });
      const profiles = await makeListMemberProfiles(ctx, users)(OWNER, { boardId });
      expect(profiles.find((p) => p.userId === "ghost")).toEqual({ userId: "ghost", role: "member", name: "Deleted user", email: null });
    });

    it("answers NotFound to a non-member", async () => {
      await expect(makeListMemberProfiles(ctx, users)(STRANGER, { boardId })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("addMemberByEmail", () => {
    const limiter = () => new InMemoryRateLimiter(ctx.clock);
    const wire = (client = "client-1", shared = limiter()) => makeAddMemberByEmail(ctx, { users, limiter: shared, clientKey: async () => client });
    const lookup = (n: number) => ({ email: `x${n}@example.com`, role: "member" as const });

    it("adds the account with that email, ignoring case and spaces", async () => {
      const added = await makeAddMemberByEmail(ctx, { users, limiter: limiter(), clientKey: async () => "client-1" })(OWNER, { boardId, email: "  Carol@Example.com ", role: "member" });
      expect(added).toEqual({ boardId, userId: "carol", role: "member" });
      expect((await ctx.repos.members.find(boardId, "carol"))?.role).toBe("member");
    });

    it("rejects unknown emails with a field error and a duplicate with Conflict", async () => {
      const add = makeAddMemberByEmail(ctx, { users, limiter: limiter(), clientKey: async () => "client-1" });
      const error = await add(OWNER, { boardId, email: "nobody@example.com", role: "member" }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fieldErrors.email).toEqual(["No account found with that email"]);
      await expect(add(OWNER, { boardId, email: "mark@example.com", role: "guest" })).rejects.toBeInstanceOf(ConflictError);
      await expect(add(OWNER, { boardId, email: "not an email", role: "member" })).rejects.toBeInstanceOf(ValidationError);
    });

    it("is for owners only: Forbidden to members, NotFound to strangers, before any lookup", async () => {
      const add = makeAddMemberByEmail(ctx, { users, limiter: limiter(), clientKey: async () => "client-1" });
      await expect(add(MEMBER, { boardId, email: "carol@example.com", role: "member" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(add(STRANGER, { boardId, email: "carol@example.com", role: "member" })).rejects.toBeInstanceOf(NotFoundError);
      expect(await ctx.repos.members.find(boardId, "carol")).toBeNull();
    });

    it("keeps demo-session owners from probing for accounts", async () => {
      const add = makeAddMemberByEmail(ctx, { users, limiter: limiter(), clientKey: async () => "client-1" });
      const guestOwner = { userId: "owner", isGuest: true };
      await expect(add(guestOwner, { boardId, email: "carol@example.com", role: "member" })).rejects.toBeInstanceOf(ForbiddenError);
      expect(await ctx.repos.members.find(boardId, "carol")).toBeNull();
    });

    it("rate limits lookups per actor", async () => {
      const add = wire();
      for (let i = 0; i < 30; i++) await add(OWNER, { boardId, ...lookup(i) }).catch(() => undefined);
      await expect(add(OWNER, { boardId, email: "carol@example.com", role: "member" })).rejects.toBeInstanceOf(RateLimitError);
      expect(await ctx.repos.members.find(boardId, "carol")).toBeNull();
    });

    it("keeps the limit per actor: one exhausted owner does not slow another, even from another client", async () => {
      const shared = limiter();
      const other = actor("other-owner");
      const { boardId: otherBoard } = await seedBoard(ctx, other);
      for (let i = 0; i < 30; i++) await wire("client-1", shared)(OWNER, { boardId, ...lookup(i) }).catch(() => undefined);
      await expect(wire("client-1", shared)(OWNER, { boardId, ...lookup(99) })).rejects.toBeInstanceOf(RateLimitError);
      await expect(wire("client-2", shared)(other, { boardId: otherBoard, ...lookup(0) })).rejects.toBeInstanceOf(ValidationError);
    });

    it("also limits per client, so many accounts behind one address share a budget", async () => {
      const shared = limiter();
      const owners = [actor("o1"), actor("o2"), actor("o3")];
      const boards = await Promise.all(owners.map((o) => seedBoard(ctx, o)));
      for (const [i, owner] of owners.slice(0, 2).entries()) {
        for (let n = 0; n < 30; n++) await wire("client-1", shared)(owner, { boardId: boards[i]!.boardId, ...lookup(n) }).catch(() => undefined);
      }
      await expect(wire("client-1", shared)(owners[2]!, { boardId: boards[2]!.boardId, ...lookup(0) })).rejects.toBeInstanceOf(RateLimitError);
      await expect(wire("client-2", shared)(owners[2]!, { boardId: boards[2]!.boardId, ...lookup(0) })).rejects.toBeInstanceOf(ValidationError);
    });

    it("spends no quota on requests refused before the lookup", async () => {
      const shared = limiter();
      const guestOwner = { userId: "owner", isGuest: true };
      for (let i = 0; i < 70; i++) {
        await wire("client-1", shared)(MEMBER, { boardId, ...lookup(i) }).catch(() => undefined);
        await wire("client-1", shared)(STRANGER, { boardId, ...lookup(i) }).catch(() => undefined);
        await wire("client-1", shared)(guestOwner, { boardId, ...lookup(i) }).catch(() => undefined);
      }
      for (let i = 0; i < 30; i++) {
        await expect(wire("client-1", shared)(OWNER, { boardId, ...lookup(i) })).rejects.toBeInstanceOf(ValidationError);
      }
    });
  });
});
