import { z } from "zod";
import { ALLOWED_CONTENT_TYPES, MAX_ATTACHMENT_BYTES, sanitizeFileName } from "../attachment-policy";
import { idSchema } from "./common";

export const requestUploadSchema = z.object({
  taskId: idSchema,
  fileName: z.string().max(1000).transform(sanitizeFileName).pipe(z.string().min(1, "File name is required")),
  contentType: z.enum(ALLOWED_CONTENT_TYPES, { error: "This file type is not allowed" }),
  size: z.number().int().min(1, "The file is empty").max(MAX_ATTACHMENT_BYTES, "Files can be at most 5 MB"),
});

export const attachmentIdSchema = z.object({ attachmentId: idSchema });

/** What a browser sends before an upload: raw facts about the file. The schema above is the authority on what is accepted. */
export interface RequestUploadInput {
  taskId: string;
  fileName: string;
  contentType: string;
  size: number;
}
