"use client";

import { ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { MAX_INITIAL_STAGES } from "@/application/stage-limits";
import { cn } from "@/components/ui/cn";

export interface StageRowState {
  key: number;
  name: string;
}

type FocusTarget = { key: number; control: "name" | "up" | "down" | "remove" };

/** The ordered stage names being edited, with the moves a visitor can make; `focus` says what to focus once the change has rendered. */
export function useStageRows(initial: readonly string[]) {
  const next = useRef(initial.length);
  const [rows, setRows] = useState<StageRowState[]>(() => initial.map((name, key) => ({ key, name })));
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  return {
    rows,
    focus,
    clearFocus: () => setFocus(null),
    canAdd: rows.length < MAX_INITIAL_STAGES,
    add() {
      const key = next.current++;
      setRows((current) => (current.length < MAX_INITIAL_STAGES ? [...current, { key, name: "" }] : current));
      setFocus({ key, control: "name" });
    },
    rename: (key: number, name: string) => setRows((current) => current.map((row) => (row.key === key ? { ...row, name } : row))),
    remove(key: number) {
      setRows((current) => {
        if (current.length <= 1) return current;
        const index = current.findIndex((row) => row.key === key);
        const neighbour = current[index + 1] ?? current[index - 1]!;
        setFocus({ key: neighbour.key, control: "name" });
        return current.filter((row) => row.key !== key);
      });
    },
    move(key: number, by: -1 | 1) {
      setRows((current) => {
        const from = current.findIndex((row) => row.key === key);
        const to = from + by;
        if (to < 0 || to >= current.length) return current;
        const moved = [...current];
        [moved[from], moved[to]] = [moved[to]!, moved[from]!];
        return moved;
      });
      setFocus({ key, control: by < 0 ? "up" : "down" });
    },
  };
}

const ICON_BUTTON =
  "rounded-lg p-2 text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/** One input per stage, posted as repeated `stages` fields (so the form works as plain HTML), with the controls to reorder and remove them. */
export function StagesEditor({ editor, errors }: { editor: ReturnType<typeof useStageRows>; errors: (index: number) => string | undefined }) {
  const t = useTranslations("pipeline.form");
  const container = useRef<HTMLUListElement>(null);
  const { rows, focus, clearFocus } = editor;
  useEffect(() => {
    if (!focus) return;
    container.current?.querySelector<HTMLElement>(`[data-row="${focus.key}"] [data-control="${focus.control}"]`)?.focus();
    clearFocus();
  }, [focus, clearFocus]);
  return (
    <ul ref={container} className="flex flex-col gap-2">
      {rows.map((row, index) => {
        const n = index + 1;
        const error = errors(index);
        const errorId = `stage-${row.key}-error`;
        return (
          <li key={row.key} data-row={row.key} className="flex animate-row-in flex-col gap-1 motion-reduce:animate-none">
            <div className="flex items-center gap-2">
              <button type="button" data-control="up" aria-label={t("moveUp", { n })} disabled={index === 0} onClick={() => editor.move(row.key, -1)} className={ICON_BUTTON}>
                <GripVertical aria-hidden="true" className="size-4" />
              </button>
              <div className="relative flex-1">
                <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xs font-medium text-fg-subtle">{n}</span>
                <input
                  type="text"
                  name="stages"
                  data-control="name"
                  value={row.name}
                  onChange={(event) => editor.rename(row.key, event.target.value)}
                  aria-label={t("stageName", { n })}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  placeholder={t("stagePlaceholder", { n })}
                  maxLength={60}
                  required
                  className={cn("w-full rounded-xl border border-border-control bg-surface py-2.5 pr-4 pl-10 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-invalid:border-danger-600")}
                />
              </div>
              <button type="button" data-control="down" aria-label={t("moveDown", { n })} disabled={index === rows.length - 1} onClick={() => editor.move(row.key, 1)} className={ICON_BUTTON}>
                <ChevronDown aria-hidden="true" className="size-4" />
              </button>
              <button type="button" data-control="remove" aria-label={t("remove", { n })} disabled={rows.length <= 1} onClick={() => editor.remove(row.key)} className={cn(ICON_BUTTON, "text-danger-fg hover:text-danger-fg")}>
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </div>
            {error ? <p id={errorId} className="pl-10 text-xs text-danger-fg">{error}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** "A → B → C": the stages as the board will show them, with a placeholder for the ones still unnamed. */
export function FlowPreview({ rows }: { rows: readonly StageRowState[] }) {
  const t = useTranslations("pipeline.form");
  return (
    <div aria-label={t("preview")} role="group" className="rounded-xl border border-border bg-surface-muted p-4">
      <p aria-hidden="true" className="mb-3 text-xs text-fg-muted">{t("previewHeading")}</p>
      <ol className="flex flex-wrap items-center gap-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-2">
            <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg-strong">{row.name.trim() || t("stagePlaceholder", { n: index + 1 })}</span>
            {index < rows.length - 1 ? <span aria-hidden="true" className="text-fg-subtle">→</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AddStageLink({ editor }: { editor: ReturnType<typeof useStageRows> }) {
  const t = useTranslations("pipeline.form");
  return (
    <button type="button" disabled={!editor.canAdd} onClick={editor.add} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-brand-link transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50">
      <Plus aria-hidden="true" className="size-4" />
      {t("addStage")}
    </button>
  );
}
