/**
 * How long an upload ticket stays valid. Five minutes is plenty for a 5 MB file, and it keeps a leaked or replayed
 * form (presigned POST, client token, local URL) from being reusable for long: the ticket is a bearer credential for
 * ONE key, capped in size and type, but nothing stops it from being used twice until it expires (ADR 0010).
 * Download URLs get their lifetime from the caller.
 */
export const UPLOAD_TICKET_TTL_SECONDS = 5 * 60;
