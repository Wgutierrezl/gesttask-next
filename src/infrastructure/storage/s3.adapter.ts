import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StoragePort, UploadTicket } from "@/application/ports/services";
import { StorageError } from "@/domain/errors";
import { UPLOAD_TICKET_TTL_SECONDS } from "./constants";
import { attachmentDisposition } from "./content-disposition";

export interface S3StorageOptions {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Set for S3-compatible servers such as RustFS; leave unset for AWS itself. */
  endpoint?: string;
  /** SDK retries; tests that simulate an outage lower it. */
  maxAttempts?: number;
}

/** DeleteObjects accepts at most 1000 keys per request. */
const DELETE_BATCH = 1000;

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof StorageError) throw error;
    // The SDK message can carry the bucket, the key or a request id: callers get a fixed message instead.
    throw new StorageError();
  }
}

const isNotFound = (error: unknown) =>
  typeof error === "object" && error !== null &&
  ((error as { name?: string }).name === "NotFound" || (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);

/**
 * AWS S3 (and S3-compatible servers). Uploads use a presigned POST because a POST policy can cap the size and pin the
 * content type, which a presigned PUT cannot (ADR 0010). The bucket stays private; reads go through presigned GETs.
 */
export class S3Storage implements StoragePort {
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: Boolean(options.endpoint),
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      maxAttempts: options.maxAttempts,
    });
  }

  prepareUpload(input: { key: string; contentType: string; size: number }): Promise<UploadTicket> {
    return guarded(async () => {
      const { url, fields } = await createPresignedPost(this.client, {
        Bucket: this.options.bucket,
        Key: input.key,
        Expires: UPLOAD_TICKET_TTL_SECONDS,
        Fields: { "Content-Type": input.contentType },
        Conditions: [["content-length-range", 1, input.size], ["eq", "$Content-Type", input.contentType]],
      });
      return { kind: "s3-post", url, fields };
    });
  }

  head(key: string): Promise<{ size: number; contentType: string } | null> {
    return guarded(async () => {
      try {
        const object = await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
        return { size: object.ContentLength ?? 0, contentType: object.ContentType ?? "application/octet-stream" };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    });
  }

  getDownloadUrl(key: string, ttlSeconds: number, options?: { fileName?: string }): Promise<string> {
    return guarded(() =>
      getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key, ResponseContentDisposition: attachmentDisposition(options?.fileName) }),
        { expiresIn: ttlSeconds },
      ),
    );
  }

  delete(keys: string[]): Promise<void> {
    return guarded(async () => {
      for (let start = 0; start < keys.length; start += DELETE_BATCH) {
        const batch = keys.slice(start, start + DELETE_BATCH);
        const result = await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.options.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
        );
        // S3 answers 200 even when some keys failed; those are reported per key and must not be swallowed.
        if (result.Errors && result.Errors.length > 0) throw new StorageError();
      }
    });
  }
}
