import { describe, expect, it } from "vitest";
import { DEFAULT_STAGES } from "./pipeline";

describe("DEFAULT_STAGES", () => {
  it("are To do, In progress and Done, in that order", () => {
    expect(DEFAULT_STAGES.map((s) => s.name)).toEqual(["To do", "In progress", "Done"]);
  });

  it("flags only the last stage as done (REQ-TSK-05)", () => {
    expect(DEFAULT_STAGES.map((s) => s.isDone)).toEqual([false, false, true]);
  });
});
