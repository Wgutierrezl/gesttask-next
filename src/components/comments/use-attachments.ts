"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_COMMENT } from "@/application/attachment-policy";
import type { UploadTicket } from "@/application/ports/services";
import { requestUploadAction } from "@/app/_actions/uploads";
import { describeFailure } from "@/components/auth/form-error";
import { formatBytes } from "./format";
import { UploadError, uploadFile } from "./upload-strategy";

export const MAX_FILES_PER_COMMENT = MAX_ATTACHMENTS_PER_COMMENT;

export interface PickedFile {
  key: number;
  name: string;
  status: "uploading" | "ready" | "failed";
  attachmentId?: string;
  message?: string;
  /** Only failures that may go away by themselves (network, rate limit) can be retried. */
  retryable?: boolean;
}

/** What a retry needs: the file itself and, when the storage (not the server) failed, the ticket that was issued. */
interface Pending {
  file: File;
  ticket?: UploadTicket;
  attachmentId?: string;
  controller: AbortController;
  /** The ticket has already been used for a retry. */
  reused?: boolean;
}

/**
 * The files of the comment being written. Each one asks the server for a ticket (the server decides whether it is
 * allowed), uploads straight to the storage, and only then counts as ready to be attached.
 * The list lives in a ref as well as in state: two picks before a re-render still see each other, so the limit holds.
 */
export function useAttachments(taskId: string) {
  const t = useTranslations("auth.errors");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const list = useRef<PickedFile[]>([]);
  const pending = useRef(new Map<number, Pending>());
  const nextKey = useRef(0);

  const commit = useCallback((next: PickedFile[]) => {
    list.current = next;
    setFiles(next);
  }, []);

  const patch = useCallback(
    (key: number, change: Partial<PickedFile>) => {
      // A removed file stays removed: a late answer must not bring it back.
      if (list.current.some((file) => file.key === key)) commit(list.current.map((file) => (file.key === key ? { ...file, ...change } : file)));
    },
    [commit],
  );

  const send = useCallback(
    async (key: number) => {
      const job = pending.current.get(key);
      if (!job) return;
      const { signal } = job.controller;
      if (!job.ticket) {
        const result = await requestUploadAction({ taskId, fileName: job.file.name, contentType: job.file.type, size: job.file.size });
        if (signal.aborted) return;
        if (!result.ok) {
          const retryable = result.code === "RATE_LIMITED" || result.code === "INTERNAL";
          return patch(key, { status: "failed", retryable, message: describeFailure(result, [], t) ?? "The upload was refused." });
        }
        job.ticket = result.data.ticket;
        job.attachmentId = result.data.attachmentId;
      }
      try {
        await uploadFile(job.ticket, job.file, signal);
        if (signal.aborted) return;
        pending.current.delete(key);
        patch(key, { status: "ready", attachmentId: job.attachmentId, retryable: false });
      } catch (error) {
        if (signal.aborted) return;
        patch(key, { status: "failed", retryable: true, message: error instanceof UploadError ? error.message : "The upload failed. Try again." });
      }
    },
    [taskId, patch, t],
  );

  const add = useCallback(
    (picked: File[]) => {
      // Files that failed do not take a slot: only uploads that are under way or done count towards the limit.
      let used = list.current.filter((file) => file.status !== "failed").length;
      const added: PickedFile[] = [];
      for (const file of picked) {
        const key = nextKey.current++;
        // The server enforces the size too; saying so here saves a ticket and an upload that cannot succeed.
        if (file.size > MAX_ATTACHMENT_BYTES) {
          added.push({ key, name: file.name, status: "failed", message: `The file is larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}` });
          continue;
        }
        if (used >= MAX_FILES_PER_COMMENT) {
          added.push({ key, name: file.name, status: "failed", message: `You can attach up to ${MAX_FILES_PER_COMMENT} files to a comment` });
          continue;
        }
        used += 1;
        added.push({ key, name: file.name, status: "uploading" });
        pending.current.set(key, { file, controller: new AbortController() });
      }
      commit([...list.current, ...added]);
      for (const { key } of added) void send(key);
    },
    [commit, send],
  );

  const remove = useCallback(
    (key: number) => {
      pending.current.get(key)?.controller.abort();
      pending.current.delete(key);
      commit(list.current.filter((file) => file.key !== key));
    },
    [commit],
  );

  /**
   * Tries again. A storage failure reuses its ticket once (no new quota or rate-limit spend); if that fails too the ticket
   * is dropped, because the client cannot tell whether it expired, and the next retry asks for a fresh one.
   */
  const retry = useCallback(
    (key: number) => {
      const job = pending.current.get(key);
      if (!job || list.current.find((file) => file.key === key)?.status !== "failed") return;
      if (job.reused) {
        job.ticket = undefined;
        job.attachmentId = undefined;
      }
      job.reused = Boolean(job.ticket);
      job.controller = new AbortController();
      patch(key, { status: "uploading", message: undefined, retryable: undefined });
      void send(key);
    },
    [patch, send],
  );

  const clear = useCallback(() => {
    for (const job of pending.current.values()) job.controller.abort();
    pending.current.clear();
    commit([]);
  }, [commit]);

  return { files, add, remove, retry, clear, busy: files.some((file) => file.status === "uploading") };
}
