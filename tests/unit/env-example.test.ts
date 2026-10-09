import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/infrastructure/config/env";

function readDotenv(path: string): Record<string, string> {
  const entries = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)] as const;
    });
  return Object.fromEntries(entries);
}

describe(".env.example", () => {
  it("is a valid configuration with local defaults and no cloud credentials", () => {
    const env = parseEnv(readDotenv(".env.example"));
    expect(env.DB_DRIVER).toBe("pg");
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.DATABASE_URL).toContain("localhost");
  });
});
