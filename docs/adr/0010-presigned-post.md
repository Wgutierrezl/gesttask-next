# ADR 0010: Uploads go straight to the storage with a size-capped, type-pinned ticket

Status: accepted (slice 6, 2026-10-10).

## Context

Attachments are at most 5 MB, but a Vercel function accepts request bodies of at most 4.5 MB, so files cannot travel
through the app. The browser must upload to the storage directly, and the storage itself must refuse anything the
application did not approve: a client can lie about the size and the type it declared.

## Decision

`StoragePort.prepareUpload({ key, contentType, size })` returns an `UploadTicket` that carries the limits:

| Driver | Ticket | What enforces the limits |
|---|---|---|
| S3 | `s3-post`: URL plus signed form fields (presigned POST) | The POST policy: `content-length-range` 1..declared size, `Content-Type` equal to the declared type, key fixed by the server, expiry 15 min. A presigned PUT cannot cap the size, which is why PUT was rejected. |
| Vercel Blob | `blob-token`: a client token bound to one pathname | `maximumSizeInBytes`, `allowedContentTypes`, `validUntil`, `allowOverwrite: false`. The size is a maximum, not a range. |
| Local | `local-put`: HMAC-signed URL to `/api/dev-storage` | The route checks signature, expiry, operation, size range and content type, exactly like the S3 policy. |

The application validates first (type list, 5 MB, permission, hourly rate, guest quota) and only then asks for a
ticket; the adapter limits are the second line of defense. The flow is:

1. `requestUpload` (server): validates, inserts a `pending` attachment under a server-made key
   (`boards/{boardId}/attachments/{attachmentId}`, never the client's file name), returns the ticket.
2. The browser sends the file with the ticket (`components/comments/upload-strategy.ts`, one small function per kind).
3. `createComment` with `attachmentIds`: the server asks the storage `head()` for each object, requires it to exist,
   fit the declared size and have the declared type, then links it (`confirmed`) in the same transaction as the
   comment. A file that never arrived or does not match is refused and the comment is not created.

## Consequences

- Anything bigger or of another type than approved is rejected by the storage, not just by our code.
- A pending upload nobody confirms stays `pending`. It counts against a demo guest's quota for one hour, then it is
  ignored; the cron (slice 9) deletes pending rows older than that and queues their objects (ADR 0011).
- Reads are never public: `getAttachmentUrl` signs a GET that lives five minutes (never more than fifteen) after
  checking board membership. The app link is `/api/attachments/{id}/download`, which redirects to the signed URL with
  `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; nothing logs the URL.
- The local route is refused on Vercel (`STORAGE_DRIVER=local` is an environment error there) instead of being
  disabled by `NODE_ENV=production`, so a production build can still run the end-to-end smoke tests locally.
