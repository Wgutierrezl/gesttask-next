import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-static";

/** The standalone build of the pinned `@scalar/api-reference`. The route is static: the file is read once, at build time. */
const BUNDLE_PATH = ["node_modules", "@scalar", "api-reference", "dist", "browser", "standalone.js"];

/** Serves Scalar's script from this origin, so the docs page needs no CDN and the CSP can stay `script-src 'self'`. */
export async function GET(): Promise<Response> {
  const source = await readFile(join(/*turbopackIgnore: true*/ process.cwd(), ...BUNDLE_PATH));
  return new Response(new Uint8Array(source), {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
