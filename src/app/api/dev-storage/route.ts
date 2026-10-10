import { getContainer } from "@/infrastructure/container";

export const dynamic = "force-dynamic";

/**
 * Receives uploads and serves downloads for STORAGE_DRIVER=local only (development, tests, smoke runs). Access is the
 * signature in the URL, checked by the adapter; with any other driver the route does not exist.
 */
const handle = (request: Request): Promise<Response> => {
  const handler = getContainer().devStorageHandler;
  return handler ? handler(request) : Promise.resolve(new Response(null, { status: 404 }));
};

export { handle as GET, handle as PUT };
