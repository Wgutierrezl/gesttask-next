import { describe, expect, it } from "vitest";
import { manageContextFor } from "@/components/kanban/stage-management";

const stages = ["s1", "s2", "s3", "s4"].map((id) => ({ id, name: id.toUpperCase() }));

describe("manageContextFor", () => {
  it("cannot move the first stage left, and moving it right means coming after its neighbour", () => {
    expect(manageContextFor(stages, 0, false)).toMatchObject({ afterWhenLeft: null, afterWhenRight: "s2" });
  });

  it("moving the second stage left means going first (after nothing), the third after the first", () => {
    expect(manageContextFor(stages, 1, false)).toMatchObject({ afterWhenLeft: "", afterWhenRight: "s3" });
    expect(manageContextFor(stages, 2, false)).toMatchObject({ afterWhenLeft: "s1", afterWhenRight: "s4" });
  });

  it("cannot move the last stage right", () => {
    expect(manageContextFor(stages, 3, false)).toMatchObject({ afterWhenLeft: "s2", afterWhenRight: null });
  });

  it("offers every other stage as a destination for the tasks of a deleted one, in order", () => {
    expect(manageContextFor(stages, 1, false).others).toEqual([stages[0], stages[2], stages[3]]);
    expect(manageContextFor([stages[0]!], 0, false)).toMatchObject({ others: [], afterWhenLeft: null, afterWhenRight: null });
  });

  it("names the stage after it, whose menu takes the focus when this one is deleted; none for the last", () => {
    expect(manageContextFor(stages, 1, false).nextStageId).toBe("s3");
    expect(manageContextFor(stages, 3, false).nextStageId).toBeNull();
  });

  it("carries the hidden-tasks flag through", () => {
    expect(manageContextFor(stages, 0, true).mayHaveHiddenTasks).toBe(true);
    expect(manageContextFor(stages, 0, false).mayHaveHiddenTasks).toBe(false);
  });
});
