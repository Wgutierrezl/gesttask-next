import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@/domain/errors";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { InMemoryUserDirectory } from "@/infrastructure/repos/in-memory-users";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, STRANGER, seedBoard } from "@tests/support/fixtures";
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
    it("joins memberships with names and emails; anonymous accounts show no email", async () => {
      const profiles = await makeListMemberProfiles(ctx, users)(GUEST, { boardId });
      expect(profiles).toEqual([
        { userId: "guest", role: "guest", name: "Anonymous", email: null },
        { userId: "member", role: "member", name: "Mark Member", email: "mark@example.com" },
        { userId: "owner", role: "owner", name: "Olivia Owner", email: "olivia@example.com" },
      ]);
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

    it("adds the account with that email, ignoring case and spaces", async () => {
      const added = await makeAddMemberByEmail(ctx, { users, limiter: limiter() })(OWNER, { boardId, email: "  Carol@Example.com ", role: "member" });
      expect(added).toEqual({ boardId, userId: "carol", role: "member" });
      expect((await ctx.repos.members.find(boardId, "carol"))?.role).toBe("member");
    });

    it("rejects unknown emails with a field error and a duplicate with Conflict", async () => {
      const add = makeAddMemberByEmail(ctx, { users, limiter: limiter() });
      const error = await add(OWNER, { boardId, email: "nobody@example.com", role: "member" }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fieldErrors.email).toEqual(["No account found with that email"]);
      await expect(add(OWNER, { boardId, email: "mark@example.com", role: "guest" })).rejects.toBeInstanceOf(ConflictError);
      await expect(add(OWNER, { boardId, email: "not an email", role: "member" })).rejects.toBeInstanceOf(ValidationError);
    });

    it("is for owners only: Forbidden to members, NotFound to strangers, before any lookup", async () => {
      const add = makeAddMemberByEmail(ctx, { users, limiter: limiter() });
      await expect(add(MEMBER, { boardId, email: "carol@example.com", role: "member" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(add(STRANGER, { boardId, email: "carol@example.com", role: "member" })).rejects.toBeInstanceOf(NotFoundError);
      expect(await ctx.repos.members.find(boardId, "carol")).toBeNull();
    });

    it("keeps demo-session owners from probing for accounts", async () => {
      const add = makeAddMemberByEmail(ctx, { users, limiter: limiter() });
      const guestOwner = { userId: "owner", isGuest: true };
      await expect(add(guestOwner, { boardId, email: "carol@example.com", role: "member" })).rejects.toBeInstanceOf(ForbiddenError);
      expect(await ctx.repos.members.find(boardId, "carol")).toBeNull();
    });

    it("rate limits lookups per actor", async () => {
      const add = makeAddMemberByEmail(ctx, { users, limiter: limiter() });
      for (let i = 0; i < 30; i++) await add(OWNER, { boardId, email: `x${i}@example.com`, role: "member" }).catch(() => undefined);
      await expect(add(OWNER, { boardId, email: "carol@example.com", role: "member" })).rejects.toBeInstanceOf(RateLimitError);
      expect(await ctx.repos.members.find(boardId, "carol")).toBeNull();
    });
  });
});
