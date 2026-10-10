import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Clock, StoragePort, UploadTicket } from "@/application/ports/services";
import { StorageError } from "@/domain/errors";
import { UPLOAD_TICKET_TTL_SECONDS } from "./constants";
import { attachmentDisposition } from "./content-disposition";

export interface LocalStorageOptions {
  rootDir: string;
  /** Signs the URLs; any string of 32+ characters. */
  secret: string;
  /** Origin the browser reaches the app on; the signed URLs point at `${baseUrl}/api/dev-storage`. */
  baseUrl: string;
  clock: Clock;
}

type Operation = "put" | "get";
interface Grant {
  op: Operation;
  key: string;
  exp: number;
  size: number;
  type: string;
  /** Download name (get only); signed like the rest, so it cannot be swapped. */
  name: string;
}

const ROUTE = "/api/dev-storage";
const fail = (): never => {
  throw new StorageError();
};
const empty = (status: number) => new Response(null, { status });

/**
 * Filesystem adapter for development and tests (REQ-LOC-02). It honors the same contract as S3 and Blob: the browser
 * gets a signed, expiring ticket and talks to the storage route directly. Object names on disk are hashes of the
 * key, so no key, however hostile, can address a path outside the root.
 */
export class LocalStorage implements StoragePort {
  constructor(private readonly options: LocalStorageOptions) {}

  async prepareUpload(input: { key: string; contentType: string; size: number }): Promise<UploadTicket> {
    const exp = this.expiry(UPLOAD_TICKET_TTL_SECONDS);
    return { kind: "local-put", url: this.url({ op: "put", key: input.key, exp, size: input.size, type: input.contentType, name: "" }) };
  }

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const meta = JSON.parse(await readFile(this.path(key, "json"), "utf8")) as { size: number; contentType: string };
      return { size: meta.size, contentType: meta.contentType };
    } catch (error) {
      if (isMissing(error)) return null;
      return fail();
    }
  }

  async getDownloadUrl(key: string, ttlSeconds: number, options?: { fileName?: string }): Promise<string> {
    return this.url({ op: "get", key, exp: this.expiry(ttlSeconds), size: 0, type: "", name: options?.fileName ?? "" });
  }

  async delete(keys: string[]): Promise<void> {
    try {
      for (const key of keys) {
        await rm(this.path(key, "bin"), { force: true });
        await rm(this.path(key, "json"), { force: true });
      }
    } catch {
      fail();
    }
  }

  /** Serves `/api/dev-storage`: the only place where bytes enter or leave. Authorization is the signature. */
  async handle(request: Request): Promise<Response> {
    if (request.method !== "PUT" && request.method !== "GET") return empty(405);
    const grant = this.verify(new URL(request.url).searchParams, request.method === "PUT" ? "put" : "get");
    if (!grant) return empty(403);
    try {
      return grant.op === "put" ? await this.receive(grant, request) : await this.send(grant);
    } catch {
      return empty(500);
    }
  }

  private async receive(grant: Grant, request: Request): Promise<Response> {
    if (request.headers.get("content-type") !== grant.type) return empty(403);
    // Refuse by the announced length before reading anything, then keep counting while reading (the header can lie or be absent).
    const announced = request.headers.get("content-length");
    if (announced !== null && !(/^\d+$/.test(announced) && Number(announced) <= grant.size)) return empty(413);
    const body = await readAtMost(request, grant.size);
    if (!body || body.byteLength < 1) return empty(413);
    await mkdir(this.options.rootDir, { recursive: true });
    await writeFile(this.path(grant.key, "bin"), body);
    await writeFile(this.path(grant.key, "json"), JSON.stringify({ size: body.byteLength, contentType: grant.type }));
    return empty(204);
  }

  private async send(grant: Grant): Promise<Response> {
    const meta = await this.head(grant.key);
    if (!meta) return empty(404);
    const body = await readFile(this.path(grant.key, "bin"));
    return new Response(body, {
      headers: { "content-type": meta.contentType, "content-length": String(meta.size), "x-content-type-options": "nosniff", "content-disposition": attachmentDisposition(grant.name === "" ? undefined : grant.name) },
    });
  }

  private expiry(ttlSeconds: number): number {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) throw new RangeError("ttlSeconds must be a positive integer");
    return Math.floor(this.options.clock.now().getTime() / 1000) + ttlSeconds;
  }

  private path(key: string, extension: "bin" | "json"): string {
    // The root is configuration, not request data: tell the bundler not to trace the whole project from this join.
    return join(/*turbopackIgnore: true*/ this.options.rootDir, `${createHash("sha256").update(key).digest("hex")}.${extension}`);
  }

  private sign(grant: Grant): string {
    return createHmac("sha256", this.options.secret).update([grant.op, grant.key, grant.exp, grant.size, grant.type, grant.name].join("\n")).digest("hex");
  }

  private url(grant: Grant): string {
    const query = new URLSearchParams({ op: grant.op, key: grant.key, exp: String(grant.exp), size: String(grant.size), type: grant.type, name: grant.name });
    query.set("sig", this.sign(grant));
    return `${this.options.baseUrl}${ROUTE}?${query.toString()}`;
  }

  /** The grant when the signature matches, it is not expired and it was issued for this very operation. */
  private verify(params: URLSearchParams, expected: Operation): Grant | null {
    const grant: Grant = {
      op: params.get("op") === "put" ? "put" : "get",
      key: params.get("key") ?? "",
      exp: Number(params.get("exp")),
      size: Number(params.get("size")),
      type: params.get("type") ?? "",
      name: params.get("name") ?? "",
    };
    const given = Buffer.from(params.get("sig") ?? "", "hex");
    const wanted = Buffer.from(this.sign(grant), "hex");
    if (grant.op !== expected || given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
    return this.options.clock.now().getTime() < grant.exp * 1000 ? grant : null;
  }
}

/** The request body, or null as soon as it exceeds `limit` bytes (the rest is never buffered). */
async function readAtMost(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(await request.arrayBuffer());
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "ENOENT";
}
