import { describe, expect, it } from "vitest";
import { createLogger, REDACTED, redact } from "@/infrastructure/logging/logger";

function capture(level?: "debug" | "info" | "warn" | "error") {
  const lines: string[] = [];
  const logger = createLogger({ write: (line) => lines.push(line), level });
  return { logger, lines, last: () => JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown> };
}

describe("redact", () => {
  it("masks sensitive keys at any depth, case-insensitively", () => {
    const out = redact({
      email: "a@b.co",
      Password: "hunter2",
      nested: { sessionToken: "abc", headers: { Cookie: "better-auth.session_token=xyz", "set-cookie": "s=1", authorization: "Bearer t" } },
      list: [{ clientSecret: "s" }, { ok: 1 }],
    });
    expect(out).toEqual({
      email: "a@b.co",
      Password: REDACTED,
      nested: { sessionToken: REDACTED, headers: { Cookie: REDACTED, "set-cookie": REDACTED, authorization: REDACTED } },
      list: [{ clientSecret: REDACTED }, { ok: 1 }],
    });
  });

  it("masks signed URLs and bearer tokens embedded in plain strings", () => {
    const signed = "https://bucket.s3.amazonaws.com/k?X-Amz-Signature=deadbeef&X-Amz-Credential=AKIA";
    expect(redact(signed)).toBe(REDACTED);
    expect(redact("failed with Bearer abc.def.ghi in header")).toBe(`failed with Bearer ${REDACTED} in header`);
    expect(redact("https://example.com/plain?page=2")).toBe("https://example.com/plain?page=2");
  });

  it("serializes errors without their stack and tolerates cycles", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const error = redact(new TypeError("boom Bearer tok123"));
    expect(error).toEqual({ name: "TypeError", message: `boom Bearer ${REDACTED}` });
    expect(redact(cyclic)).toEqual({ name: "loop", self: "[Circular]" });
  });

  it("leaves primitives alone", () => {
    expect([redact(1), redact(null), redact(undefined), redact(true)]).toEqual([1, null, undefined, true]);
  });
});

describe("createLogger", () => {
  it("writes one JSON line with level, message and redacted context", () => {
    const { logger, lines, last } = capture();
    logger.info("login", { userId: "u1", token: "secret-token", cookie: "c=1" });
    expect(lines).toHaveLength(1);
    expect(last()).toMatchObject({ level: "info", msg: "login", userId: "u1", token: REDACTED, cookie: REDACTED });
    expect(lines[0]).not.toContain("secret-token");
  });

  it("drops entries below the configured level", () => {
    const { logger, lines } = capture("warn");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(lines.map((l) => JSON.parse(l).level)).toEqual(["warn", "error"]);
  });

  it("never lets context override the reserved fields", () => {
    const { logger, last } = capture();
    logger.error("real", { level: "debug", msg: "fake" });
    expect(last()).toMatchObject({ level: "error", msg: "real" });
  });

  it("writes to stdout by default", () => {
    const logger = createLogger();
    expect(() => logger.debug("noop")).not.toThrow();
  });
});
