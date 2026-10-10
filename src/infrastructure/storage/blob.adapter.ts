import { BlobNotFoundError, del, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import type { Clock, StoragePort, UploadTicket } from "@/application/ports/services";
import { StorageError } from "@/domain/errors";
import { UPLOAD_TICKET_TTL_SECONDS } from "./constants";

/** The slice of the Vercel Blob SDK this adapter uses, so tests can stand in for the control API. */
export interface BlobApi {
  generateClientToken(options: {
    token: string;
    pathname: string;
    maximumSizeInBytes: number;
    allowedContentTypes: string[];
    validUntil: number;
  }): Promise<string>;
  head(pathname: string, options: { token: string }): Promise<{ size: number; contentType: string }>;
  del(pathnames: string[], options: { token: string }): Promise<void>;
  issueSignedToken(options: { token: string; pathname: string; operations: ["get"]; validUntil: number }): Promise<{
    delegationToken: string;
    clientSigningToken: string;
    validUntil: number;
  }>;
  presignUrl(
    signed: { delegationToken: string; clientSigningToken: string },
    options: { operation: "get"; pathname: string; validUntil: number; access: "private" },
  ): Promise<{ presignedUrl: string }>;
}

const sdk: BlobApi = {
  generateClientToken: (options) =>
    generateClientTokenFromReadWriteToken({ ...options, addRandomSuffix: false, allowOverwrite: false }),
  head: async (pathname, options) => {
    const { size, contentType } = await head(pathname, options);
    return { size, contentType };
  },
  del: (pathnames, options) => del(pathnames, options),
  issueSignedToken: (options) => issueSignedToken(options),
  presignUrl: (signed, options) => presignUrl(signed, options),
};

export interface BlobStorageOptions {
  /** Read-write token: a server secret that never reaches the browser (only the client token derived from it does). */
  token: string;
  clock: Clock;
  api?: BlobApi;
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof StorageError) throw error;
    // SDK errors may echo request details; callers get a fixed message and no token material.
    throw new StorageError();
  }
}

/**
 * Vercel Blob fallback (ADR 0009). Every object is PRIVATE: the browser uploads with a short-lived client token that
 * is bound to one pathname and capped in size and type, and reads happen through presigned GET URLs with a TTL.
 */
export class BlobStorage implements StoragePort {
  private readonly api: BlobApi;

  constructor(private readonly options: BlobStorageOptions) {
    this.api = options.api ?? sdk;
  }

  prepareUpload(input: { key: string; contentType: string; size: number }): Promise<UploadTicket> {
    return guarded(async () => {
      const clientToken = await this.api.generateClientToken({
        token: this.options.token,
        pathname: input.key,
        maximumSizeInBytes: input.size,
        allowedContentTypes: [input.contentType],
        validUntil: this.validUntil(UPLOAD_TICKET_TTL_SECONDS),
      });
      return { kind: "blob-token", clientToken, pathname: input.key };
    });
  }

  head(key: string): Promise<{ size: number; contentType: string } | null> {
    return guarded(async () => {
      try {
        return await this.api.head(key, { token: this.options.token });
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    });
  }

  /** `fileName` is ignored: a presigned Blob GET honors only its expiry (PresignGetUrlOptions), so the stored disposition stands (ADR 0009). */
  getDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return guarded(async () => {
      const validUntil = this.validUntil(ttlSeconds);
      const signed = await this.api.issueSignedToken({ token: this.options.token, pathname: key, operations: ["get"], validUntil });
      const { presignedUrl } = await this.api.presignUrl(signed, { operation: "get", pathname: key, validUntil, access: "private" });
      return presignedUrl;
    });
  }

  delete(keys: string[]): Promise<void> {
    if (keys.length === 0) return Promise.resolve();
    return guarded(() => this.api.del(keys, { token: this.options.token }));
  }

  private validUntil(ttlSeconds: number): number {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) throw new RangeError("ttlSeconds must be a positive integer");
    return this.options.clock.now().getTime() + ttlSeconds * 1000;
  }
}
