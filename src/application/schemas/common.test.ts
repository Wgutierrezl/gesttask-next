import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError } from "@/domain/errors";
import { pageWindow, paginationSchema } from "./common";
import { parseInput } from "./parse";

describe("paginationSchema", () => {
  it("defaults to limit 50 and offset 0", () => {
    expect(parseInput(paginationSchema, {})).toEqual({ limit: 50, offset: 0 });
  });

  it("coerces query-string values and accepts the maximum", () => {
    expect(parseInput(paginationSchema, { limit: "200", offset: "10" })).toEqual({ limit: 200, offset: 10 });
  });

  it("keeps the public maximum at 200: the peek row is a flag, not a wider limit", () => {
    expect(() => parseInput(paginationSchema, { limit: "201" })).toThrow(ValidationError);
    expect(parseInput(paginationSchema, { limit: "200", peek: true })).toEqual({ limit: 200, offset: 0, peek: true });
  });

  it.each([{ limit: 202 }, { limit: 201 }, { limit: 0 }, { offset: -1 }, { limit: 1.5 }, { peek: "yes" }])("rejects %o", (input) => {
    expect(() => parseInput(paginationSchema, input)).toThrow(ValidationError);
  });
});

describe("pageWindow", () => {
  it("is the page as asked when there is no peek", () => {
    expect(pageWindow({ limit: 200, offset: 10 })).toEqual({ limit: 200, offset: 10 });
    expect(pageWindow({ limit: 7, offset: 0, peek: false })).toEqual({ limit: 7, offset: 0 });
  });

  it("asks the repository for one row more when peeking, and never leaks the flag", () => {
    expect(pageWindow({ limit: 200, offset: 10, peek: true })).toEqual({ limit: 201, offset: 10 });
    expect(pageWindow({ limit: 3, offset: 0, peek: true })).toEqual({ limit: 4, offset: 0 });
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
