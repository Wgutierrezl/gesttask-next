import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: { path: string; schedule: string }[] };

describe("vercel.json", () => {
  it("schedules the maintenance route to run once a day: Hobby accepts nothing more frequent", () => {
    expect(config.crons).toHaveLength(1);
    const [cron] = config.crons!;
    expect(cron!.path).toBe("/api/cron/reset");
    // minute hour day-of-month month day-of-week: fixed minute and hour, every day.
    expect(cron!.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
  });

  it("points at a route that exists", () => {
    expect(existsSync("src/app/api/cron/reset/route.ts")).toBe(true);
  });
});
