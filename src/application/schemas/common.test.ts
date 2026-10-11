import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError } from "@/domain/errors";
import { paginationSchema } from "./common";
import { parseInput } from "./parse";

describe("paginationSchema", () => {
  it("defaults to limit 50 and offset 0", () => {
    expect(parseInput(paginationSchema, {})).toEqual({ limit: 50, offset: 0 });
  });

  it("coerces query-string values and accepts the maximum", () => {
    expect(parseInput(paginationSchema, { limit: "200", offset: "10" })).toEqual({ limit: 200, offset: 10 });
  });

  it("accepts one row beyond the public maximum: the peek row the REST layer asks for to know whether another page exists", () => {
    expect(parseInput(paginationSchema, { limit: "201" })).toEqual({ limit: 201, offset: 0 });
  });

  it.each([{ limit: 202 }, { limit: 0 }, { offset: -1 }, { limit: 1.5 }])("rejects %o", (input) => {
    expect(() => parseInput(paginationSchema, input)).toThrow(ValidationError);
  });
});

describe("parseInput", () => {
  const schema = z.object({ title: z.string().min(1), nested: z.object({ n: z.number() }) });

  it("returns the parsed value", () => {
    expect(parseInput(schema, { title: "a", nested: { n: 1 } })).toEqual({ title: "a", nested: { n: 1 } });
  });

  it("maps issues to field errors keyed by path", () => {
    const error = (() => {
      try {
        parseInput(schema, { title: "", nested: { n: "x" } });
      } catch (e) {
        return e as ValidationError;
      }
    })();
    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.keys(error?.fieldErrors ?? {}).sort()).toEqual(["nested.n", "title"]);
  });

  it("reports root-level problems under _", () => {
    const error = (() => {
      try {
        parseInput(schema, "not an object");
      } catch (e) {
        return e as ValidationError;
      }
    })();
    expect(Object.keys(error?.fieldErrors ?? {})).toEqual(["_"]);
  });
});
