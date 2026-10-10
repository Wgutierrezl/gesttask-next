import { runAction } from "@/application/to-action-result";
import { getContainer } from "@/infrastructure/container";

export const dynamic = "force-dynamic";

/** Foreign, missing, forbidden and malformed all read the same: nothing about existence leaks (REQ-ISO-08). */
const STATUS = { NOT_FOUND: 404, FORBIDDEN: 404, VALIDATION: 404, UNAUTHENTICATED: 401, STORAGE: 502, CONFLICT: 409, RATE_LIMITED: 429 } as const;

/**
 * The download link of an attachment: checks the session and the board membership, then redirects to a signed URL that
 * lives for minutes (REQ-ATT-02). The URL is a credential, so the response is uncacheable, hides the referrer, and
 * nothing here logs it (REQ-SEC-01).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }): Promise<Response> {
  const { attachmentId } = await params;
  const result = await runAction(
    () => getContainer().useCases.getAttachmentUrl({ attachmentId }),
    (error) => getContainer().logger.error("download failed", { error }),
  );
  if (!result.ok) return new Response(null, { status: STATUS[result.code as keyof typeof STATUS] ?? 500 });
  return new Response(null, { status: 302, headers: { Location: result.data.url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
