import { describe, expect, it } from "vitest";
import { serverActionOrigins } from "../../src/app/_shared/allowed-origins";

describe("serverActionOrigins", () => {
  it("allows the host (and port) of BETTER_AUTH_URL only", () => {
    expect(serverActionOrigins("https://gesttask.example.com")).toEqual(["gesttask.example.com"]);
    expect(serverActionOrigins("http://localhost:3000/")).toEqual(["localhost:3000"]);
  });

  it("is empty without a URL or with a malformed one (same-origin only)", () => {
    expect(serverActionOrigins(undefined)).toEqual([]);
    expect(serverActionOrigins("")).toEqual([]);
    expect(serverActionOrigins("not a url")).toEqual([]);
  });
});
