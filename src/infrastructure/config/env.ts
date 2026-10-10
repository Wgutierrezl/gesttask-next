import "server-only";
import { z } from "zod";

/** Optional URL: an empty string (`S3_ENDPOINT=` in a dotenv file) counts as unset. */
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const dbSchema = z.object({
  DB_DRIVER: z.enum(["pg", "neon"]),
  DATABASE_URL: z.url(),
});

/** The value shipped in .env.example: fine locally, refused in production. */
export const PLACEHOLDER_AUTH_SECRET = "change-me-generate-with-openssl-rand-base64-32";

const authSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public origin of the app; Better Auth derives it from the request when unset.
    BETTER_AUTH_URL: optionalUrl,
  })
  .refine((env) => env.NODE_ENV !== "production" || env.BETTER_AUTH_SECRET !== PLACEHOLDER_AUTH_SECRET, {
    path: ["BETTER_AUTH_SECRET"],
    message: "placeholder secret",
  });

const storageSchema = z.discriminatedUnion("STORAGE_DRIVER", [
  z.object({ STORAGE_DRIVER: z.literal("local") }),
  z.object({
    STORAGE_DRIVER: z.literal("s3"),
    S3_BUCKET: z.string().min(1),
    AWS_REGION: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    // Set for S3-compatible servers such as RustFS; omitted for AWS itself.
    S3_ENDPOINT: optionalUrl,
  }),
  z.object({
    STORAGE_DRIVER: z.literal("blob"),
    BLOB_READ_WRITE_TOKEN: z.string().min(1),
  }),
]);

const envSchema = z.intersection(z.intersection(dbSchema, authSchema), storageSchema);

export type Env = z.infer<typeof envSchema>;

/** Thrown on invalid configuration. The message lists keys only, never values. */
export class EnvError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "EnvError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  // Zod messages can echo input values, so only the path and issue code are reported.
  const issues = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(root)";
    return `${key}: ${describe(issue.code)}`;
  });
  throw new EnvError(issues);
}

function describe(code: string): string {
  switch (code) {
    case "invalid_value":
      return "unsupported value";
    case "invalid_format":
      return "malformed value";
    case "invalid_type":
      return "missing or wrong type";
    case "too_small":
      return "must not be empty";
    default:
      return "invalid";
  }
}

let cached: Env | undefined;

/** Validates `process.env` once and fails fast at startup. */
export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  if (source !== process.env) return parseEnv(source);
  cached ??= parseEnv(source);
  return cached;
}
