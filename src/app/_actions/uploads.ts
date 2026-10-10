"use server";

import type { ActionResult } from "@/application/result";
import type { RequestUploadInput } from "@/application/schemas/attachment";
import type { UploadRequest } from "@/application/use-cases/attachments/request-upload";
import { runMutationData } from "../_shared/run-mutation";
import { getContainer } from "@/infrastructure/container";

/**
 * Step 1 of attaching a file: the browser sends only what it knows about the file, the server validates it (type, size,
 * permission, rate, quota) and answers with a ticket for uploading straight to the storage (REQ-CMT-02).
 */
export async function requestUploadAction(input: RequestUploadInput): Promise<ActionResult<UploadRequest>> {
  return runMutationData(() => getContainer().useCases.requestUpload(input));
}
