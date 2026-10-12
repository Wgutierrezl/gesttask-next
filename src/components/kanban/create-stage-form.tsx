"use client";

import { useTranslations } from "next-intl";
import { createStageAction } from "@/app/_actions/stages";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { StageNameFields } from "./stage-name-fields";

export function CreateStageForm({ pipelineId }: { pipelineId: string }) {
  const t = useTranslations("stages");
  return (
    <MutationForm action={createStageAction} hidden={{ pipelineId }} inlineFields={["name"]} className="flex max-w-sm flex-col gap-3">
      {(failure) => (
        <>
          <StageNameFields idPrefix="new-stage" offerDone errors={failure?.fieldErrors?.name} />
          <div>
            <SubmitButton pendingLabel={t("adding")}>{t("addStage")}</SubmitButton>
          </div>
        </>
      )}
    </MutationForm>
  );
}
