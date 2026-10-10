"use client";

import { ALLOWED_CONTENT_TYPES } from "@/application/attachment-policy";
import { MAX_FILES_PER_COMMENT, type PickedFile } from "./use-attachments";

interface AttachmentPickerProps {
  files: PickedFile[];
  onPick: (files: File[]) => void;
  onRemove: (key: number) => void;
  demoGuest: boolean;
}

const statusText = (file: PickedFile) => (file.status === "uploading" ? "uploading..." : file.status === "ready" ? "ready" : (file.message ?? "failed"));

/** File input plus the state of each chosen file. Ready files travel with the comment as hidden `attachmentIds`. */
export function AttachmentPicker({ files, onPick, onRemove, demoGuest }: AttachmentPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="comment-files" className="text-sm font-medium">Attach files</label>
      <input
        id="comment-files"
        type="file"
        multiple
        accept={ALLOWED_CONTENT_TYPES.join(",")}
        aria-describedby="comment-files-help"
        onChange={(event) => {
          onPick([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
        className="text-sm"
      />
      <p id="comment-files-help" className="text-xs text-gray-600">
        PNG, JPEG, WebP, PDF or plain text, up to 5 MB each and {MAX_FILES_PER_COMMENT} per comment.
        {demoGuest ? " Demo sessions can attach up to 5 files in total." : ""}
      </p>
      {files.length > 0 ? (
        <ul aria-live="polite" className="flex flex-col gap-1 text-sm">
          {files.map((file) => (
            <li key={file.key} className="flex items-center gap-2">
              <span className={file.status === "failed" ? "text-red-700" : undefined}>{`${file.name}: ${statusText(file)}`}</span>
              <button type="button" onClick={() => onRemove(file.key)} aria-label={`Remove ${file.name}`} className="underline">Remove</button>
              {file.attachmentId ? <input type="hidden" name="attachmentIds" value={file.attachmentId} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
