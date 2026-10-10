"use client";

import { useCallback, useRef, useState } from "react";
import { requestUploadAction } from "@/app/_actions/uploads";
import { describeFailure } from "@/components/auth/form-error";
import { UploadError, uploadFile } from "./upload-strategy";

export const MAX_FILES_PER_COMMENT = 5;

export interface PickedFile {
  key: number;
  name: string;
  status: "uploading" | "ready" | "failed";
  attachmentId?: string;
  message?: string;
}

/**
 * The files of the comment being written. Each one asks the server for a ticket (the server decides whether it is
 * allowed), uploads straight to the storage, and only then counts as ready to be attached.
 */
export function useAttachments(taskId: string) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const nextKey = useRef(0);

  const patch = useCallback((key: number, change: Partial<PickedFile>) => {
    setFiles((all) => all.map((file) => (file.key === key ? { ...file, ...change } : file)));
  }, []);

  const send = useCallback(
    async (key: number, file: File) => {
      const result = await requestUploadAction({ taskId, fileName: file.name, contentType: file.type, size: file.size });
      if (!result.ok) return patch(key, { status: "failed", message: describeFailure(result) ?? "The upload was refused." });
      try {
        await uploadFile(result.data.ticket, file);
        patch(key, { status: "ready", attachmentId: result.data.attachmentId });
      } catch (error) {
        patch(key, { status: "failed", message: error instanceof UploadError ? error.message : "The upload failed. Try again." });
      }
    },
    [taskId, patch],
  );

  const add = useCallback(
    (picked: File[]) => {
      // Files that failed do not take a slot: only uploads that are under way or done count towards the limit.
      let used = files.filter((file) => file.status !== "failed").length;
      const added: PickedFile[] = [];
      for (const file of picked) {
        const key = nextKey.current++;
        if (used >= MAX_FILES_PER_COMMENT) {
          added.push({ key, name: file.name, status: "failed", message: `You can attach up to ${MAX_FILES_PER_COMMENT} files to a comment` });
          continue;
        }
        used += 1;
        added.push({ key, name: file.name, status: "uploading" });
        void send(key, file);
      }
      setFiles((all) => [...all, ...added]);
    },
    [files, send],
  );

  const remove = useCallback((key: number) => setFiles((all) => all.filter((file) => file.key !== key)), []);
  const clear = useCallback(() => setFiles([]), []);

  return { files, add, remove, clear, busy: files.some((file) => file.status === "uploading") };
}
