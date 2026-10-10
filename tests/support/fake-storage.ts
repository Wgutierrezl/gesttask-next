import type { StoragePort, UploadTicket } from "@/application/ports/services";
import { StorageError } from "@/domain/errors";

/** In-memory StoragePort for application tests: records what the use cases asked for and can simulate uploads and outages. */
export class FakeStorage implements StoragePort {
  readonly objects = new Map<string, { size: number; contentType: string }>();
  readonly prepared: { key: string; contentType: string; size: number }[] = [];
  readonly signed: { key: string; ttlSeconds: number }[] = [];
  readonly deleted: string[][] = [];
  failing = false;

  private check(): void {
    if (this.failing) throw new StorageError();
  }

  async prepareUpload(input: { key: string; contentType: string; size: number }): Promise<UploadTicket> {
    this.check();
    this.prepared.push(input);
    return { kind: "local-put", url: `https://storage.test/put/${input.key}` };
  }

  /** What the browser does after receiving a ticket: the object shows up in the store. */
  upload(key: string, size: number, contentType: string): void {
    this.objects.set(key, { size, contentType });
  }

  async head(key: string) {
    this.check();
    return this.objects.get(key) ?? null;
  }

  async getDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    this.check();
    this.signed.push({ key, ttlSeconds });
    return `https://storage.test/get/${key}?ttl=${ttlSeconds}`;
  }

  async delete(keys: string[]): Promise<void> {
    this.check();
    this.deleted.push(keys);
    for (const key of keys) this.objects.delete(key);
  }
}
