"use client";

import { useState } from "react";
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
  const inputId = `${idPrefix}-name`;
  const errorId = `${idPrefix}-name-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium">{label}</label>
      <input
        id={inputId}
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        maxLength={60}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      {errors ? <p id={errorId} role="alert" className="text-sm text-red-700">{errors.join(" ")}</p> : null}
      {suggest ? (
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" name="markDone" value="yes" className="mt-0.5" />
          <span>Mark as the done stage (tasks entering it count as completed)</span>
        </label>
      ) : null}
    </div>
  );
}
