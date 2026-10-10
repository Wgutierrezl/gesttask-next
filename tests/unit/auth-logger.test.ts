import { describe, expect, it } from "vitest";
import { toAuthLogger } from "@/infrastructure/auth/better-auth";
import { createLogger, REDACTED } from "@/infrastructure/logging/logger";

describe("toAuthLogger", () => {
  it("routes Better Auth log calls through the redacting logger", () => {
    const lines: string[] = [];
    const auth = toAuthLogger(createLogger({ level: "debug", write: (line) => lines.push(line) }));
    auth.log("error", "sign-in failed", { sessionToken: "abc123", detail: "Bearer xyz.789" });
    auth.log("debug", "noise");
    const [first, second] = lines.map((line) => JSON.parse(line));
    expect(first).toMatchObject({ level: "error", msg: "sign-in failed", args: [{ sessionToken: REDACTED, detail: `Bearer ${REDACTED}` }] });
    expect(second).toMatchObject({ level: "debug", msg: "noise", args: [] });
    expect(lines.join()).not.toMatch(/abc123|xyz\.789/);
  });
});
