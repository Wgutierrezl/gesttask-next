import { expect, it } from "vitest";
import * as schema from "./schema";

it("colocated application tests may import the test runner", () => {
  expect(schema).toBeDefined();
});
