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

/** The commented-out block of a driver, uncommented: what a developer does when switching drivers. */
function enabled(path: string, names: string[]): Record<string, string> {
  const uncommented = readFileSync(path, "utf8").split("\n").filter((line) => names.some((name) => line.startsWith(`# ${name}=`))).map((line) => line.slice(2));
  const base = readDotenv(path);
  return { ...base, ...Object.fromEntries(uncommented.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])) };
}

describe(".env.example", () => {
  it("documents a complete S3 setup that validates once uncommented", () => {
    const env = parseEnv({ ...enabled(".env.example", ["S3_BUCKET", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_ENDPOINT"]), STORAGE_DRIVER: "s3" });
    expect(env.STORAGE_DRIVER).toBe("s3");
    if (env.STORAGE_DRIVER === "s3") expect([env.S3_BUCKET, env.S3_ENDPOINT]).toEqual(["gesttask", "http://localhost:9000"]);
  });

  it("lists the Blob token, which must be filled in before the Blob driver validates", () => {
    const source = { ...enabled(".env.example", ["BLOB_READ_WRITE_TOKEN"]), STORAGE_DRIVER: "blob" };
    expect(() => parseEnv(source)).toThrow(/BLOB_READ_WRITE_TOKEN/);
    expect(parseEnv({ ...source, BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" }).STORAGE_DRIVER).toBe("blob");
  });

  it("is a valid configuration with local defaults and no cloud credentials", () => {
    const env = parseEnv(readDotenv(".env.example"));
    expect(env.DB_DRIVER).toBe("pg");
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.DATABASE_URL).toContain("localhost");
  });
});
