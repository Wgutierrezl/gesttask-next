import { describe, expect, it } from "vitest";
import { API_RATE_READ, API_RATE_WRITE, apiRateChecks } from "./api-policy";

describe("apiRateChecks", () => {
  it("charges an unknown caller one bucket, by address, at the address ceiling", () => {
    const [only, ...rest] = apiRateChecks("read", "addr1");
    expect(rest).toEqual([]);
    expect(only?.key).toBe("api:read:addr1");
    expect(only?.rule.windowSeconds).toBe(API_RATE_READ.windowSeconds);
    expect(only?.rule.limit).toBeGreaterThan(API_RATE_READ.limit); // a shared address (NAT) holds many users
  });

  it("charges a signed-in user by user+address AND by user alone, so rotating addresses does not multiply the budget", () => {
    const checks = apiRateChecks("write", "addr1", "user-9");
    expect(checks.map((check) => check.key)).toEqual(["api:write:u:user-9:addr1", "api:write:u:user-9"]);
    const [perAddress, perUser] = checks;
    expect(perAddress?.rule).toEqual(API_RATE_WRITE);
    expect(perUser?.rule.limit).toBeGreaterThan(API_RATE_WRITE.limit); // across addresses: more than one, not unbounded
    expect(perUser?.rule.windowSeconds).toBe(API_RATE_WRITE.windowSeconds);
  });

  it("keeps reads and writes in separate buckets and different users apart", () => {
    const keys = [...apiRateChecks("read", "a", "u1"), ...apiRateChecks("write", "a", "u1"), ...apiRateChecks("read", "a", "u2")].map((check) => check.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
