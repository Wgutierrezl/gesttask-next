import { StorageError } from "@/domain/errors";
import type { StoragePort, UploadTicket } from "@/application/ports/services";
import type { LocalStorage } from "../storage/local.adapter";
import type { SeedFiles } from "./seed-demo-board";

export interface SeedFilesSource {
  driver: "local" | "s3" | "blob";
  storage: StoragePort;
  /** The filesystem adapter when `driver` is local: the seed has no server to PUT to, so it calls the adapter's own handler. */
  local: LocalStorage | null;
}

async function send(ticket: UploadTicket, contentType: string, bytes: Uint8Array<ArrayBuffer>, local: LocalStorage | null): Promise<boolean> {
  if (ticket.kind === "local-put") {
    if (!local) return false;
    const request = new Request(ticket.url, { method: "PUT", headers: { "content-type": contentType }, body: new Blob([bytes]) });
    return (await local.handle(request)).status === 204;
  }
  if (ticket.kind === "s3-post") {
    const form = new FormData();
    // The browser contract: every signed field first (with the type the client really sends), the file last.
    for (const [name, value] of Object.entries({ ...ticket.fields, "Content-Type": contentType })) form.append(name, value);
    form.append("file", new Blob([bytes], { type: contentType }));
    return (await fetch(ticket.url, { method: "POST", body: form })).ok;
  }
  return false;
}

/**
 * Stores the demo attachments through the SAME upload tickets the browser gets, so the seed exercises the real adapter and
 * its limits. `null` for Blob: its tokens are made for a browser session, so the seed runs there without attachments.
 */
export function createSeedFiles(source: SeedFilesSource): SeedFiles | null {
  if (source.driver === "blob") return null;
  return {
    async put(key, contentType, bytes) {
      const body = Uint8Array.from(bytes);
      const ticket = await source.storage.prepareUpload({ key, contentType, size: body.byteLength });
      if (!(await send(ticket, contentType, body, source.local))) throw new StorageError();
    },
    delete: (keys) => source.storage.delete(keys),
  };
}
