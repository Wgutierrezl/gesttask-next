import { describe, expect, it } from "vitest";
import { isTerminalStage, type Stage } from "./pipeline";

const stage = (id: string, position: string): Stage => ({ id, pipelineId: "p", boardId: "b", name: id, position });

describe("isTerminalStage", () => {
  const stages = [stage("done", "z"), stage("todo", "A"), stage("doing", "M")];

  it("is true only for the stage with the highest position, regardless of input order", () => {
    expect(isTerminalStage("done", stages)).toBe(true);
    expect(isTerminalStage("todo", stages)).toBe(false);
    expect(isTerminalStage("doing", stages)).toBe(false);
  });

  it("is false for unknown stages and empty pipelines", () => {
    expect(isTerminalStage("ghost", stages)).toBe(false);
    expect(isTerminalStage("any", [])).toBe(false);
  });
});
