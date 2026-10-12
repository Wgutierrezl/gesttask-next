"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ALLOWED_CONTENT_TYPES, MAX_ATTACHMENT_BYTES } from "@/application/attachment-policy";
import { Input } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { formatBytes } from "./format";
import { MAX_FILES_PER_COMMENT, type PickedFile } from "./use-attachments";

interface AttachmentPickerProps {
  files: PickedFile[];
  onPick: (files: File[]) => void;
  onRemove: (key: number) => void;
  onRetry: (key: number) => void;
  demoGuest: boolean;
}

function StatusIcon({ status }: { status: PickedFile["status"] }) {
  if (status === "uploading") return <Loader2 aria-hidden="true" className="size-4 animate-spin text-fg-subtle" />;
  if (status === "ready") return <CheckCircle2 aria-hidden="true" className="size-4 text-success-600" />;
  return <XCircle aria-hidden="true" className="size-4 text-danger-600" />;
}

/** File input plus the state of each chosen file. Ready files travel with the comment as hidden `attachmentIds`. */
export function AttachmentPicker({ files, onPick, onRemove, onRetry, demoGuest }: AttachmentPickerProps) {
  const t = useTranslations("attachments");
  const locale = useLocale() as Locale;
  const statusText = (file: PickedFile) => (file.status === "uploading" ? t("uploading") : file.status === "ready" ? t("ready") : (file.message ?? t("failed")));
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="comment-files" className="text-sm font-medium text-fg-strong">{t("label")}</label>
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
        className="file:mr-3 file:rounded-control file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-fg-strong"
      />
      <p id="comment-files-help" className="text-xs text-fg-muted">
        {t("help", { size: formatBytes(MAX_ATTACHMENT_BYTES, locale), max: MAX_FILES_PER_COMMENT })}
        {demoGuest ? ` ${t("demoQuota")}` : ""}
      </p>
      {/* Always in the page, so a change is announced the moment it appears. The failed text is announced here, once. */}
      <div aria-live="polite">
        {files.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {files.map((file) => (
            <li key={file.key} aria-busy={file.status === "uploading" ? true : undefined} className="flex items-center gap-2">
              <StatusIcon status={file.status} />
              <span className={file.status === "failed" ? "text-danger-fg" : "text-fg-strong"}>{`${file.name}: ${statusText(file)}`}</span>
              {file.status === "failed" && file.retryable ? (
                <button type="button" onClick={() => onRetry(file.key)} aria-label={t("retryAria", { name: file.name })} className="rounded text-brand-link underline hover:text-accent focus-visible:outline-2 focus-visible:outline-ring">{t("retry")}</button>
              ) : null}
              <button type="button" onClick={() => onRemove(file.key)} aria-label={t("removeAria", { name: file.name })} className="rounded text-fg-muted underline hover:text-fg focus-visible:outline-2 focus-visible:outline-ring">{t("remove")}</button>
              {file.attachmentId ? <input type="hidden" name="attachmentIds" value={file.attachmentId} /> : null}
            </li>
          ))}
        </ul>
        ) : null}
      </div>
    </div>
  );
}
