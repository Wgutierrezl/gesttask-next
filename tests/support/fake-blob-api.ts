import { createHmac } from "node:crypto";
import { BlobFileTooLargeError, BlobContentTypeNotAllowedError, BlobNotFoundError, BlobPathnameMismatchError, BlobClientTokenExpiredError } from "@vercel/blob";
import type { BlobApi } from "@/infrastructure/storage/blob.adapter";

const KEY = "fake-blob-signing-key";
const sign = (value: string) => createHmac("sha256", KEY).update(value).digest("base64url");

interface ClientToken {
  pathname: string;
  maximumSizeInBytes: number;
  allowedContentTypes: string[];
  validUntil: number;
}

/**
 * A stand-in for the Vercel Blob control API that enforces what the real service enforces for our flow: client tokens
 * bound to one pathname, a size cap, a content-type allow list and an expiry, plus signed read URLs for private blobs.
 * `now` is injectable so contract tests can move time.
 */
export class FakeBlobApi implements BlobApi {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();
  calls: string[] = [];
  failWith: Error | null = null;

  constructor(
    private readonly expectedToken: string,
    private readonly now: () => number = Date.now,
  ) {}

  private auth(token: string): void {
    this.calls.push("auth");
    if (this.failWith) throw this.failWith;
    if (token !== this.expectedToken) throw new Error("401 invalid token");
  }

  async generateClientToken(options: Parameters<BlobApi["generateClientToken"]>[0]): Promise<string> {
    this.auth(options.token);
    const payload: ClientToken = {
      pathname: options.pathname,
      maximumSizeInBytes: options.maximumSizeInBytes,
      allowedContentTypes: options.allowedContentTypes,
      validUntil: options.validUntil,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `fake_client_${body}.${sign(body)}`;
  }

  /** What the browser SDK does with the token: `put(pathname, body, { access: "private", token })`. */
  async clientPut(clientToken: string, pathname: string, body: Uint8Array, contentType: string): Promise<void> {
    const [encoded = "", signature = ""] = clientToken.replace("fake_client_", "").split(".");
    if (signature !== sign(encoded)) throw new Error("401 invalid client token");
    const token = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ClientToken;
    if (this.now() > token.validUntil) throw new BlobClientTokenExpiredError();
    if (token.pathname !== pathname) throw new BlobPathnameMismatchError("pathname does not match the token");
    if (body.byteLength > token.maximumSizeInBytes) throw new BlobFileTooLargeError(String(token.maximumSizeInBytes));
    if (!token.allowedContentTypes.includes(contentType)) throw new BlobContentTypeNotAllowedError(contentType);
    this.objects.set(pathname, { body, contentType });
  }

  async head(pathname: string, options: { token: string }): Promise<{ size: number; contentType: string }> {
    this.auth(options.token);
    const object = this.objects.get(pathname);
    if (!object) throw new BlobNotFoundError();
    return { size: object.body.byteLength, contentType: object.contentType };
  }

  async del(pathnames: string[], options: { token: string }): Promise<void> {
    this.auth(options.token);
    for (const pathname of pathnames) this.objects.delete(pathname);
  }

  async issueSignedToken(options: Parameters<BlobApi["issueSignedToken"]>[0]): Promise<{ delegationToken: string; clientSigningToken: string; validUntil: number }> {
    this.auth(options.token);
    const delegationToken = Buffer.from(JSON.stringify({ pathname: options.pathname, validUntil: options.validUntil })).toString("base64url");
    return { delegationToken, clientSigningToken: sign(delegationToken), validUntil: options.validUntil };
  }

  async presignUrl(signed: { delegationToken: string; clientSigningToken: string }, options: Parameters<BlobApi["presignUrl"]>[1]): Promise<{ presignedUrl: string }> {
    const query = new URLSearchParams({ d: signed.delegationToken, exp: String(options.validUntil), s: sign(`${options.pathname}|${options.validUntil}`) });
    return { presignedUrl: `https://fake-store.private.blob.vercel-storage.com/${encodeURI(options.pathname)}?${query.toString()}` };
  }

  /** GET of a presigned URL, as the browser would do it (no credentials). */
  fetchPresigned(url: string): { status: number; body: Uint8Array; contentType: string | null } {
    const parsed = new URL(url);
    const pathname = decodeURI(parsed.pathname.slice(1));
    const exp = Number(parsed.searchParams.get("exp"));
    if (parsed.searchParams.get("s") !== sign(`${pathname}|${exp}`) || this.now() >= exp) return { status: 403, body: new Uint8Array(), contentType: null };
    const object = this.objects.get(pathname);
    return object ? { status: 200, body: object.body, contentType: object.contentType } : { status: 404, body: new Uint8Array(), contentType: null };
  }
}
