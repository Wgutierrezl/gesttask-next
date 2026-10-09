import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/infrastructure/config/env";

const localBase = {
  DB_DRIVER: "pg",
  DATABASE_URL: "postgres://gesttask:gesttask@localhost:5432/gesttask",
  STORAGE_DRIVER: "local",
};

const s3Base = {
  ...localBase,
  STORAGE_DRIVER: "s3",
  S3_BUCKET: "gesttask",
  AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "access-key-id",
  AWS_SECRET_ACCESS_KEY: "super-secret-value",
};

function without(
  source: Record<string, string>,
  key: string,
): Record<string, string | undefined> {
  return { ...source, [key]: undefined };
}

function errorOf(source: Record<string, string | undefined>): EnvError {
  try {
    parseEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    return error as EnvError;
  }
  throw new Error("expected parseEnv to throw");
}

describe("parseEnv", () => {
  it("accepts the local driver combination without any cloud credentials", () => {
    const env = parseEnv(localBase);
    expect(env.DB_DRIVER).toBe("pg");
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.DATABASE_URL).toBe(localBase.DATABASE_URL);
  });

  it("accepts the s3 driver when its keys are present", () => {
    const env = parseEnv({ ...s3Base, S3_ENDPOINT: "http://localhost:9000" });
    expect(env.STORAGE_DRIVER).toBe("s3");
    if (env.STORAGE_DRIVER !== "s3") throw new Error("narrowing");
    expect(env.S3_BUCKET).toBe("gesttask");
    expect(env.S3_ENDPOINT).toBe("http://localhost:9000");
  });

  it("accepts the blob driver when its token is present", () => {
    const env = parseEnv({ ...localBase, STORAGE_DRIVER: "blob", BLOB_READ_WRITE_TOKEN: "tok" });
    expect(env.STORAGE_DRIVER).toBe("blob");
  });

  it("accepts the neon DB driver", () => {
    expect(parseEnv({ ...localBase, DB_DRIVER: "neon" }).DB_DRIVER).toBe("neon");
  });

  it("fails when STORAGE_DRIVER is missing", () => {
    expect(errorOf(without(localBase, "STORAGE_DRIVER")).message).toContain("STORAGE_DRIVER");
  });

  it("fails when DB_DRIVER is missing", () => {
    expect(errorOf(without(localBase, "DB_DRIVER")).message).toContain("DB_DRIVER");
  });

  it("fails on an unknown STORAGE_DRIVER without echoing the provided value", () => {
    const message = errorOf({ ...localBase, STORAGE_DRIVER: "ftp-leaky-value" }).message;
    expect(message).toContain("STORAGE_DRIVER");
    expect(message).not.toContain("ftp-leaky-value");
  });

  it("fails on an unknown DB_DRIVER", () => {
    expect(errorOf({ ...localBase, DB_DRIVER: "mysql" }).message).toContain("DB_DRIVER");
  });

  it("requires S3 keys only when STORAGE_DRIVER=s3", () => {
    expect(errorOf(without(s3Base, "S3_BUCKET")).message).toContain("S3_BUCKET");
    expect(() => parseEnv(localBase)).not.toThrow();
  });

  it("requires the blob token when STORAGE_DRIVER=blob", () => {
    expect(errorOf({ ...localBase, STORAGE_DRIVER: "blob" }).message).toContain(
      "BLOB_READ_WRITE_TOKEN",
    );
  });

  it("never leaks secret values in the error message", () => {
    const message = errorOf(without(s3Base, "S3_BUCKET")).message;
    expect(message).not.toContain("super-secret-value");
    expect(message).not.toContain("access-key-id");
  });

  it("rejects a malformed DATABASE_URL", () => {
    expect(errorOf({ ...localBase, DATABASE_URL: "not a url" }).message).toContain("DATABASE_URL");
  });
});
