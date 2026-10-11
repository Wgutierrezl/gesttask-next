import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvError, PLACEHOLDER_AUTH_SECRET, parseEnv } from "@/infrastructure/config/env";

const localBase = {
  DB_DRIVER: "pg",
  DATABASE_URL: "postgres://gesttask:gesttask@localhost:5432/gesttask",
  STORAGE_DRIVER: "local",
  BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-chars!!",
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

describe("parseEnv: CRON_SECRET", () => {
  it("is optional (the cron endpoint stays closed without it) and an empty value counts as unset", () => {
    expect(parseEnv(localBase).CRON_SECRET).toBeUndefined();
    expect(parseEnv({ ...localBase, CRON_SECRET: "" }).CRON_SECRET).toBeUndefined();
  });

  it("accepts a secret of at least 16 characters and refuses a weaker one, naming the key but never the value", () => {
    expect(parseEnv({ ...localBase, CRON_SECRET: "0123456789abcdef" }).CRON_SECRET).toBe("0123456789abcdef");
    const error = errorOf({ ...localBase, CRON_SECRET: "short-secret" });
    expect(error.message).toContain("CRON_SECRET");
    expect(error.message).not.toContain("short-secret");
  });
});

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

  it("refuses the local storage driver on Vercel, where the filesystem is ephemeral", () => {
    expect(errorOf({ ...localBase, VERCEL: "1" }).message).toContain("STORAGE_DRIVER");
    expect(parseEnv({ ...s3Base, VERCEL: "1" }).STORAGE_DRIVER).toBe("s3");
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

  it("treats an empty S3_ENDPOINT as unset", () => {
    const env = parseEnv({ ...s3Base, S3_ENDPOINT: "" });
    expect(env.STORAGE_DRIVER).toBe("s3");
    expect(env).not.toHaveProperty("S3_ENDPOINT", "");
  });

  it("still rejects a malformed non-empty S3_ENDPOINT", () => {
    expect(errorOf({ ...s3Base, S3_ENDPOINT: "not a url" }).message).toContain("S3_ENDPOINT");
  });
});

describe("auth settings", () => {
  it("requires BETTER_AUTH_SECRET, at least 32 characters, and never echoes it", () => {
    expect(errorOf(without(localBase, "BETTER_AUTH_SECRET")).message).toContain("BETTER_AUTH_SECRET");
    const short = errorOf({ ...localBase, BETTER_AUTH_SECRET: "too-short-leaky" });
    expect(short.message).toContain("BETTER_AUTH_SECRET");
    expect(short.message).not.toContain("too-short-leaky");
  });

  it("treats BETTER_AUTH_URL as an optional URL (empty counts as unset)", () => {
    expect(parseEnv({ ...localBase, BETTER_AUTH_URL: "" }).BETTER_AUTH_URL).toBeUndefined();
    expect(parseEnv({ ...localBase, BETTER_AUTH_URL: "http://localhost:3000" }).BETTER_AUTH_URL).toBe("http://localhost:3000");
    expect(errorOf({ ...localBase, BETTER_AUTH_URL: "nope" }).message).toContain("BETTER_AUTH_URL");
  });

  it("rejects the .env.example placeholder secret in production only", () => {
    const placeholder = { ...localBase, BETTER_AUTH_SECRET: PLACEHOLDER_AUTH_SECRET };
    expect(() => parseEnv(placeholder)).not.toThrow();
    expect(() => parseEnv({ ...placeholder, NODE_ENV: "development" })).not.toThrow();
    const message = errorOf({ ...placeholder, NODE_ENV: "production" }).message;
    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).not.toContain(PLACEHOLDER_AUTH_SECRET);
  });
});

describe("BETTER_AUTH_URL in production", () => {
  it("is required in production and optional elsewhere", () => {
    expect(() => parseEnv({ ...localBase, NODE_ENV: "development" })).not.toThrow();
    expect(errorOf({ ...localBase, NODE_ENV: "production" }).message).toContain("BETTER_AUTH_URL");
    expect(errorOf({ ...localBase, NODE_ENV: "production", BETTER_AUTH_URL: "" }).message).toContain("BETTER_AUTH_URL");
    expect(parseEnv({ ...localBase, NODE_ENV: "production", BETTER_AUTH_URL: "https://gesttask.example.com" }).BETTER_AUTH_URL).toBe(
      "https://gesttask.example.com",
    );
  });
});

describe("proxy trust settings", () => {
  it("defaults to no trusted proxies and not-Vercel", () => {
    const env = parseEnv(localBase);
    expect(env.TRUSTED_PROXY_HOPS).toBe(0);
    expect(env.VERCEL).toBeUndefined();
  });

  it("accepts a small non-negative integer of hops and rejects the rest", () => {
    expect(parseEnv({ ...localBase, TRUSTED_PROXY_HOPS: "2" }).TRUSTED_PROXY_HOPS).toBe(2);
    expect(parseEnv({ ...localBase, TRUSTED_PROXY_HOPS: "" }).TRUSTED_PROXY_HOPS).toBe(0);
    for (const bad of ["-1", "1.5", "abc", "11"]) {
      expect(errorOf({ ...localBase, TRUSTED_PROXY_HOPS: bad }).message, bad).toContain("TRUSTED_PROXY_HOPS");
    }
  });
});

describe("getEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("validates process.env once and returns the cached result", async () => {
    vi.resetModules();
    for (const [key, value] of Object.entries(localBase)) vi.stubEnv(key, value);
    const { getEnv } = await import("@/infrastructure/config/env");

    const first = getEnv();
    vi.stubEnv("STORAGE_DRIVER", "unsupported");
    const second = getEnv();

    expect(second).toBe(first);
  });

  it("fails fast when process.env is invalid", async () => {
    vi.resetModules();
    for (const [key, value] of Object.entries({ ...localBase, STORAGE_DRIVER: "bogus" })) {
      vi.stubEnv(key, value);
    }
    const { getEnv } = await import("@/infrastructure/config/env");
    expect(() => getEnv()).toThrow("STORAGE_DRIVER");
  });
});
