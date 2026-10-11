"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { suggestsDone } from "./stage-names";

interface StageNameFieldsProps {
  /** Keeps ids unique when several stage forms share a page. */
  idPrefix: string;
  defaultName?: string;
  /** Only the create form offers the done flag; renaming leaves it to the stage's own toggle. */
  offerDone: boolean;
  label?: string;
  errors?: string[];
}

/** The stage name input plus, when the name looks like a done stage, an unticked box offering to flag it. */
export function StageNameFields({ idPrefix, defaultName = "", offerDone, label = "Name", errors }: StageNameFieldsProps) {
  const [name, setName] = useState(defaultName);
  const suggest = offerDone && suggestsDone(name);
  return (
    <div className="flex flex-col gap-1">
      <Field label={label} error={errors?.join(" ")}>
        <Input id={`${idPrefix}-name`} name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} />
      </Field>
      {suggest ? (
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input type="checkbox" name="markDone" value="yes" className="mt-0.5 size-4 accent-brand-600" />
          <span>Mark as the done stage (tasks entering it count as completed)</span>
        </label>
      ) : null}
    </div>
  );
}
