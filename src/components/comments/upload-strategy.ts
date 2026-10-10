import type { UploadTicket } from "@/application/ports/services";

/** The storage refused the file or could not be reached. The message is safe to show: it carries no URL or token. */
export class UploadError extends Error {
  constructor(message = "The upload failed. Try again.") {
    super(message);
    this.name = "UploadError";
  }
}

const refused = (ok: boolean) => {
  if (!ok) throw new UploadError();
};

/**
 * One small strategy per ticket kind (REQ-STO-01): the browser sends the file straight to the storage, never through
 * the app's functions. The ticket carries the limits the storage enforces (size range, content type, expiry).
 */
const strategies = {
  // A presigned POST: every signed field first, the file last (S3 ignores fields that follow it).
  "s3-post": async (ticket: Extract<UploadTicket, { kind: "s3-post" }>, file: File) => {
    const body = new FormData();
    for (const [name, value] of Object.entries(ticket.fields)) body.append(name, value);
    body.append("file", file);
    refused((await fetch(ticket.url, { method: "POST", body })).ok);
  },
  "local-put": async (ticket: Extract<UploadTicket, { kind: "local-put" }>, file: File) => {
    refused((await fetch(ticket.url, { method: "PUT", headers: { "content-type": file.type }, body: file })).ok);
  },
  // Loaded on demand: only deployments that use Vercel Blob pay for the SDK.
  "blob-token": async (ticket: Extract<UploadTicket, { kind: "blob-token" }>, file: File) => {
    const { put } = await import("@vercel/blob/client");
    await put(ticket.pathname, file, { access: "private", token: ticket.clientToken, contentType: file.type });
  },
} as const;

export async function uploadFile(ticket: UploadTicket, file: File): Promise<void> {
  try {
    await (strategies[ticket.kind] as (ticket: UploadTicket, file: File) => Promise<void>)(ticket, file);
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError(); // network and SDK errors may echo the signed URL: never pass them on
  }
}
