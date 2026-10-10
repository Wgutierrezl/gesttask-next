# ADR 0009: Storage behind StoragePort (S3 primary, Vercel Blob fallback, local for dev)

Status: accepted (spike 6.0, 2026-10-10). Complements ADR 0010 (presigned POST) and ADR 0011 (deletion outbox).

## Decision

Attachment bytes live in object storage, never in Postgres and never pass through a serverless function (Vercel
caps request bodies at 4.5 MB, below our 5 MB file limit). `application` talks to `StoragePort` only; the driver
is chosen by `STORAGE_DRIVER=s3|blob|local` in the composition root and validated by Zod at startup (a missing
driver, or a driver without its credentials, fails fast with key names and no values).

```ts
interface StoragePort {
  prepareUpload({ key, contentType, size }): Promise<UploadTicket>; // s3-post | blob-token | local-put
  head(key): Promise<{ size; contentType } | null>;                  // null when the object does not exist
  getDownloadUrl(key, ttlSeconds): Promise<string>;                  // signed, expiring, buckets stay private
  delete(keys): Promise<void>;                                       // idempotent for missing keys
}
```

Limits (5 MB per file, allowed MIME list, 5 attachments per comment, guest cap) are validated in `application`
BEFORE a ticket is issued; the adapters enforce the same limits a second time inside the ticket so a client that
lies about the size or type is refused by the storage itself. Adapter failures are always `StorageError` (HTTP
502 at the REST edge); an adapter never returns an empty string or `null` as if it had worked.

## Spike 6.0: Vercel Blob (`@vercel/blob@2.8.1`, verified from the published package types, 2026-10-10)

| Question | Finding |
|---|---|
| Private objects | Supported: `access: "private" \| "public"` on `put`, `get` and on client uploads. Private blobs "require authentication to access". We always use `private`. |
| Client uploads | The server mints a client token with `generateClientTokenFromReadWriteToken({ pathname, maximumSizeInBytes, allowedContentTypes, validUntil, addRandomSuffix: false, allowOverwrite: false })`; the browser calls `put(pathname, file, { access: "private", token, contentType })` from `@vercel/blob/client`. A `handleUpload` route is only needed for the SDK `upload()` helper; minting the token inside `prepareUpload` keeps the whole flow inside the port. The token is bound to one pathname (`BlobPathnameMismatchError`) and expires (`validUntil`, default 1 h; we use 15 min). |
| Size and type limits | `maximumSizeInBytes` and `allowedContentTypes` travel inside the client token and are enforced by Blob (`BlobFileTooLargeError`, `BlobContentTypeNotAllowedError`). Unlike an S3 POST policy the size is a maximum, not a range. |
| Short-lived read access | `issueSignedToken({ pathname, operations: ["get"], validUntil })` plus `presignUrl(token, { operation: "get", pathname, validUntil, access: "private" })` returns `{ presignedUrl }` for a private blob. This needs the read-write token (server side only); it gives us the same "signed URL with TTL" the S3 adapter has, so no trade-off on private access is needed. |
| Metadata | `head(pathname)` returns `{ size, contentType, ... }` and throws `BlobNotFoundError` when missing (mapped to `null`). |
| Delete | `del(pathnames[])`, one request for many keys. |
| Environment | `BLOB_READ_WRITE_TOKEN`. The same token reads, writes and deletes, so it is a server secret and is never sent to the browser (only the derived client token is). |

Consequence: no "public but unguessable URL" fallback is needed. If a future SDK version drops private access the
Blob adapter must be disabled rather than silently downgraded.

## Spike 6.0: AWS S3 (`@aws-sdk/*@3.1149.0`)

- `@aws-sdk/s3-presigned-post` `createPresignedPost` builds the POST policy with `content-length-range` and an
  exact `Content-Type` condition (a presigned PUT cannot cap the size, hence ADR 0010).
- `@aws-sdk/s3-request-presigner` `getSignedUrl(GetObjectCommand)` produces the download URL. The TTL we use is
  300 s and never above 900 s (REQ-ATT-02).
- `HeadObjectCommand` maps `NotFound` to `null`; `DeleteObjectsCommand` is idempotent for missing keys but reports
  per-key failures in `Errors`, which we turn into a `StorageError` instead of swallowing them.
- `S3_ENDPOINT` points the same adapter at RustFS locally and in CI (`forcePathStyle: true` when set).

### Least-privilege IAM (production)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::BUCKET/boards/*"
    }
  ]
}
```

`s3:HeadObject` needs `s3:GetObject`; no `ListBucket`, no `*` actions and no bucket-level permissions. The bucket
blocks all public access, has CORS for the app origin only (`POST` for uploads, `GET` for downloads), and a
lifecycle rule that aborts incomplete multipart uploads after one day.

## Local driver

`LocalStorage` keeps objects on disk under `.local-storage/` (git-ignored). Names on disk are SHA-256 hashes of the
key, so no key can address a path outside the root. Tickets and download URLs are HMAC-signed URLs with an expiry
that point at the `/api/dev-storage` route (404 for every other driver; `STORAGE_DRIVER=local` is rejected as an
environment error on Vercel), which verifies the signature, the operation, the size range and the content type exactly
like an S3 POST policy would.

## Contract

`tests/contract/storage.contract.ts` runs unchanged against every adapter: local always, S3 against RustFS
(integration job and `pnpm db:up`), Blob against a mocked control API (a live variant is skipped unless
`BLOB_READ_WRITE_TOKEN` and `RUN_LIVE_BLOB=1` are set, and is reported as skipped, never as passed).

## Switching drivers

Attachments are not migrated when `STORAGE_DRIVER` changes: a row keeps its key, and the key only resolves in the
driver that stored it. Switch drivers only on an empty store (or accept orphaned attachments).
