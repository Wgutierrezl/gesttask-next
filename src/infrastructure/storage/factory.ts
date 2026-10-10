import { createHmac } from "node:crypto";
import type { Clock, StoragePort } from "@/application/ports/services";
import type { Env } from "../config/env";
import { BlobStorage } from "./blob.adapter";
import { LocalStorage } from "./local.adapter";
import { S3Storage } from "./s3.adapter";

export interface BuiltStorage {
  storage: StoragePort;
  /** The filesystem adapter when it is the active driver: its `handle` serves `/api/dev-storage`. */
  local: LocalStorage | null;
}

const DEFAULT_ORIGIN = "http://localhost:3000";

/** Key separation: the URL signing key is derived from the auth secret, so a leaked URL signature says nothing about it. */
const storageUrlKey = (authSecret: string): string => createHmac("sha256", authSecret).update("gesttask:storage-url:v1").digest("hex");

/** The single place where STORAGE_DRIVER selects an adapter (REQ-STO-01); env validation already guaranteed its credentials. */
export function createStorage(env: Env, clock: Clock): BuiltStorage {
  switch (env.STORAGE_DRIVER) {
    case "s3": {
      const storage = new S3Storage({
        bucket: env.S3_BUCKET,
        region: env.AWS_REGION,
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        endpoint: env.S3_ENDPOINT,
      });
      return { storage, local: null };
    }
    case "blob":
      return { storage: new BlobStorage({ token: env.BLOB_READ_WRITE_TOKEN, clock }), local: null };
    case "local": {
      const local = new LocalStorage({ rootDir: ".local-storage", secret: storageUrlKey(env.BETTER_AUTH_SECRET), baseUrl: env.BETTER_AUTH_URL ?? DEFAULT_ORIGIN, clock });
      return { storage: local, local };
    }
  }
}
