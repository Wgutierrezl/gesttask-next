import { put } from "@vercel/blob/client";
import { runStorageContract } from "@tests/contract/storage.contract";
import { BlobStorage } from "@/infrastructure/storage/blob.adapter";

/**
 * Optional: the same contract against a real Vercel Blob store. Needs a store token AND an explicit opt-in, so a stray
 * token in the environment never writes to a production store. Without both it is reported as skipped.
 */
const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
const enabled = Boolean(token) && process.env.RUN_LIVE_BLOB === "1";

runStorageContract(
  "Vercel Blob (live store)",
  () => ({
    storage: new BlobStorage({ token, clock: { now: () => new Date() } }),
    async upload(ticket, body, contentType) {
      if (ticket.kind !== "blob-token") throw new Error("expected a blob-token ticket");
      return put(ticket.pathname, new Blob([body], { type: contentType }), { access: "private", token: ticket.clientToken, contentType }).then(
        () => true,
        () => false,
      );
    },
    async fetchUrl(url) {
      const response = await fetch(url);
      return { status: response.status, body: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") };
    },
    broken: () => new BlobStorage({ token: "vercel_blob_rw_invalid_token", clock: { now: () => new Date() } }),
    pass: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 500)),
  }),
  { skip: !enabled },
);
