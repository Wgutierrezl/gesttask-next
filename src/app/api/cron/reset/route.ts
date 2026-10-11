import { getContainer } from "@/infrastructure/container";

export const dynamic = "force-dynamic";
/** Seconds. The jobs are batched and bounded, but a cold database wake-up has to fit as well. */
export const maxDuration = 60;

const NO_STORE = { "cache-control": "no-store" };

/**
 * Scheduled maintenance (REQ-DEMO-02): purges expired demo guests, abandoned uploads and old rate-limit windows, and deletes
 * the storage objects they leave behind. Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`; anything else is a 401
 * that says nothing about why.
 */
export async function GET(request: Request): Promise<Response> {
  const { cron } = getContainer();
  if (!cron.authorized(request.headers.get("authorization"))) {
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }, { status: 401, headers: NO_STORE });
  }
  const report = await cron.run();
  return Response.json(report, { status: report.ok ? 200 : 500, headers: NO_STORE });
}
