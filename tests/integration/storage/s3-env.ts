import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import type { S3StorageOptions } from "@/infrastructure/storage/s3.adapter";

/** Defaults match docker-compose.yml (RustFS); CI and real buckets override them through the environment. */
export function s3TestOptions(): S3StorageOptions {
  return {
    bucket: process.env.S3_BUCKET ?? "gesttask",
    region: process.env.AWS_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "gesttask",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "gesttask-secret",
  };
}

/** CI sets STORAGE_DRIVER=s3 and must fail, not skip, when the server is missing. */
export const S3_REQUIRED = process.env.STORAGE_DRIVER === "s3";

/** True when the bucket exists (created when missing) on the configured S3-compatible server. */
export async function s3Available(options = s3TestOptions()): Promise<boolean> {
  const client = new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    forcePathStyle: Boolean(options.endpoint),
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    maxAttempts: 1,
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: options.bucket })).catch(async () => {
      await client.send(new CreateBucketCommand({ Bucket: options.bucket }));
    });
    return true;
  } catch {
    return false;
  } finally {
    client.destroy();
  }
}
