import { runStorageContract } from "@tests/contract/storage.contract";
import { S3Storage } from "@/infrastructure/storage/s3.adapter";
import { S3_REQUIRED, s3Available, s3TestOptions } from "./s3-env";

const options = s3TestOptions();
const available = await s3Available(options);
if (S3_REQUIRED && !available) throw new Error("STORAGE_DRIVER=s3 but the S3 server is unreachable");

runStorageContract(
  "S3 (RustFS)",
  () => ({
    storage: new S3Storage(options),
    async upload(ticket, body, contentType) {
      if (ticket.kind !== "s3-post") throw new Error("expected an s3-post ticket");
      const form = new FormData();
      // The browser contract: every signed field first (with the type the client really sends), the file last.
      for (const [name, value] of Object.entries({ ...ticket.fields, "Content-Type": contentType })) form.append(name, value);
      form.append("file", new Blob([body], { type: contentType }));
      return (await fetch(ticket.url, { method: "POST", body: form })).ok;
    },
    async fetchUrl(url) {
      const response = await fetch(url);
      return { status: response.status, body: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type"), disposition: response.headers.get("content-disposition") };
    },
    namesDownloads: true,
    // Nothing listens on port 1: every call fails at the socket, like an AWS outage would.
    broken: () => new S3Storage({ ...options, endpoint: "http://127.0.0.1:1", maxAttempts: 1 }),
    pass: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 500)),
  }),
  { skip: !available },
);
