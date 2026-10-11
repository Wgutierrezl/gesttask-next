"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { ALLOWED_CONTENT_TYPES, MAX_ATTACHMENT_BYTES } from "@/application/attachment-policy";
import { Input } from "@/components/ui/field";
import { formatBytes } from "./format";
import { MAX_FILES_PER_COMMENT, type PickedFile } from "./use-attachments";

interface AttachmentPickerProps {
  files: PickedFile[];
  onPick: (files: File[]) => void;
  onRemove: (key: number) => void;
  onRetry: (key: number) => void;
  demoGuest: boolean;
}

const statusText = (file: PickedFile) => (file.status === "uploading" ? "uploading..." : file.status === "ready" ? "ready" : (file.message ?? "failed"));

function StatusIcon({ status }: { status: PickedFile["status"] }) {
  if (status === "uploading") return <Loader2 aria-hidden="true" className="size-4 animate-spin text-slate-500" />;
  if (status === "ready") return <CheckCircle2 aria-hidden="true" className="size-4 text-success-600" />;
  return <XCircle aria-hidden="true" className="size-4 text-danger-600" />;
}

/** File input plus the state of each chosen file. Ready files travel with the comment as hidden `attachmentIds`. */
export function AttachmentPicker({ files, onPick, onRemove, onRetry, demoGuest }: AttachmentPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="comment-files" className="text-sm font-medium text-slate-700">Attach files</label>
      <Input
        id="comment-files"
        type="file"
        multiple
        accept={ALLOWED_CONTENT_TYPES.join(",")}
        aria-describedby="comment-files-help"
        onChange={(event) => {
          onPick([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
        className="file:mr-3 file:rounded-control file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium file:text-slate-700"
      />
      <p id="comment-files-help" className="text-xs text-slate-600">
        PNG, JPEG, WebP, PDF or plain text, up to {formatBytes(MAX_ATTACHMENT_BYTES)} each and {MAX_FILES_PER_COMMENT} per comment.
        {demoGuest ? " Demo sessions can attach up to 5 files in total." : ""}
      </p>
      {/* Always in the page, so a change is announced the moment it appears. The failed text is announced here, once. */}
      <div aria-live="polite">
        {files.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {files.map((file) => (
            <li key={file.key} aria-busy={file.status === "uploading" ? true : undefined} className="flex items-center gap-2">
              <StatusIcon status={file.status} />
              <span className={file.status === "failed" ? "text-danger-700" : "text-slate-700"}>{`${file.name}: ${statusText(file)}`}</span>
              {file.status === "failed" && file.retryable ? (
                <button type="button" onClick={() => onRetry(file.key)} aria-label={`Retry ${file.name}`} className="rounded text-brand-700 underline hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-brand-600">Retry</button>
              ) : null}
              <button type="button" onClick={() => onRemove(file.key)} aria-label={`Remove ${file.name}`} className="rounded text-slate-600 underline hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-600">Remove</button>
              {file.attachmentId ? <input type="hidden" name="attachmentIds" value={file.attachmentId} /> : null}
            </li>
          ))}
        </ul>
        ) : null}
      </div>
    </div>
  );
}
