import { describe, expect, it } from "vitest";
import { PRIORITIES } from "./priority";

describe("colocated test", () => {
  it("may import the test runner", () => {
    expect(PRIORITIES).toBeDefined();
  });
});
