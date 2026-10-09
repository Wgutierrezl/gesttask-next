import { createHash } from "node:crypto";
import type { Actor } from "@/application/actor";
import type { GuestSandbox } from "@/application/ports/services";
import type { Database } from "../db/client";
import { ensureDemoUsers } from "../seed/demo-users";
import { seedDemoBoard, type SeedDeps } from "../seed/seed-demo-board";

/** One fixed board id per guest: provisioning twice (or concurrently) can only ever produce the same sandbox. */
export function sandboxBoardId(guestUserId: string): string {
  const hex = createHash("sha256").update(`guest-sandbox:${guestUserId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Clones the demo board for a guest, who becomes its owner (REQ-AUTH-02, REQ-DEMO-03). */
export class SeededGuestSandbox implements GuestSandbox {
  constructor(
    private readonly db: Database,
    private readonly deps: SeedDeps,
  ) {}

  async hasBoards(guest: Actor): Promise<boolean> {
    return (await this.deps.uow.run((tx) => tx.members.listByUser(guest.userId))).some((m) => m.role === "owner");
  }

  async provision(guest: Actor): Promise<void> {
    await ensureDemoUsers(this.db);
    await seedDemoBoard(this.deps, { ownerId: guest.userId, boardId: sandboxBoardId(guest.userId) });
  }
}
