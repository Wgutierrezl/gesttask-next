"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { ALLOWED_CONTENT_TYPES } from "@/application/attachment-policy";
import { Input } from "@/components/ui/field";
import { MAX_FILES_PER_COMMENT, type PickedFile } from "./use-attachments";

interface AttachmentPickerProps {
  files: PickedFile[];
  onPick: (files: File[]) => void;
  onRemove: (key: number) => void;
  demoGuest: boolean;
}

const statusText = (file: PickedFile) => (file.status === "uploading" ? "uploading..." : file.status === "ready" ? "ready" : (file.message ?? "failed"));

function StatusIcon({ status }: { status: PickedFile["status"] }) {
  if (status === "uploading") return <Loader2 aria-hidden="true" className="size-4 animate-spin text-slate-500" />;
  if (status === "ready") return <CheckCircle2 aria-hidden="true" className="size-4 text-success-600" />;
  return <XCircle aria-hidden="true" className="size-4 text-danger-600" />;
}

/** File input plus the state of each chosen file. Ready files travel with the comment as hidden `attachmentIds`. */
export function AttachmentPicker({ files, onPick, onRemove, demoGuest }: AttachmentPickerProps) {
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
        PNG, JPEG, WebP, PDF or plain text, up to 5 MB each and {MAX_FILES_PER_COMMENT} per comment.
        {demoGuest ? " Demo sessions can attach up to 5 files in total." : ""}
      </p>
      {files.length > 0 ? (
        <ul aria-live="polite" className="flex flex-col gap-1 text-sm">
          {files.map((file) => (
            <li key={file.key} aria-busy={file.status === "uploading" ? true : undefined} className="flex items-center gap-2">
              <StatusIcon status={file.status} />
              <span role={file.status === "failed" ? "alert" : undefined} className={file.status === "failed" ? "text-danger-700" : "text-slate-700"}>{`${file.name}: ${statusText(file)}`}</span>
              <button type="button" onClick={() => onRemove(file.key)} aria-label={`Remove ${file.name}`} className="rounded text-slate-600 underline hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-600">Remove</button>
              {file.attachmentId ? <input type="hidden" name="attachmentIds" value={file.attachmentId} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
