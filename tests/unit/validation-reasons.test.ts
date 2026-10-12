import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "@/application/attachment-policy";
import { signUpSchema } from "@/application/schemas/auth";
import { createBoardSchema } from "@/application/schemas/board";
import { COMMENT_MAX_LENGTH, createCommentSchema, editCommentSchema } from "@/application/schemas/comment";
import { addMemberByEmailSchema } from "@/application/schemas/member";
import { parseInput } from "@/application/schemas/parse";
import { createPipelineSchema, updatePipelineSchema } from "@/application/schemas/pipeline";
import { requestUploadSchema } from "@/application/schemas/attachment";
import { createStageSchema } from "@/application/schemas/stage";
import { createTaskSchema } from "@/application/schemas/task";
import { ValidationError, type ErrorDetail } from "@/domain/errors";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

const ID = "00000000-0000-4000-8000-000000000001";
const render = (messages: typeof en, locale: "en" | "es", detail: ErrorDetail) =>
  (createTranslator({ locale, messages: messages as never, namespace: "errors.validation" as never, onError: (e) => { throw e; } }) as unknown as (key: string, values?: object) => string)(detail.reason, detail.params);
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(",");
const raw = (catalog: typeof en, reason: string) => reason.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], catalog.errors.validation) as string | undefined;

/** Every schema that writes (or relies on Zod for) a message a visitor can reach, with an input that triggers each one. */
const CASES: [label: string, schema: Parameters<typeof parseInput>[0], input: unknown][] = [
  ["board name empty", createBoardSchema, { name: "  " }],
  ["board name long", createBoardSchema, { name: "x".repeat(101) }],
  ["board description long", createBoardSchema, { name: "n", description: "x".repeat(2001) }],
  ["pipeline name empty", createPipelineSchema, { boardId: ID, name: " " }],
  ["pipeline name long", updatePipelineSchema, { pipelineId: ID, name: "x".repeat(101) }],
  ["pipeline description long", createPipelineSchema, { boardId: ID, name: "n", description: "x".repeat(2001) }],
  ["pipeline stages empty", createPipelineSchema, { boardId: ID, name: "n", stages: [] }],
  ["pipeline stages too many", createPipelineSchema, { boardId: ID, name: "n", stages: Array.from({ length: 21 }, (_, i) => `S${i}`) }],
  ["pipeline stages duplicated", createPipelineSchema, { boardId: ID, name: "n", stages: ["A", "a"] }],
  ["pipeline stage blank", createPipelineSchema, { boardId: ID, name: "n", stages: ["A", " "] }],
  ["comment empty", createCommentSchema, { taskId: ID, body: " " }],
  ["comment long", createCommentSchema, { taskId: ID, body: "x".repeat(COMMENT_MAX_LENGTH + 1) }],
  ["comment edit empty", editCommentSchema, { commentId: ID, body: "" }],
  ["upload file name", requestUploadSchema, { taskId: ID, fileName: "folder/", contentType: "image/png", size: 1 }],
  ["upload type", requestUploadSchema, { taskId: ID, fileName: "a.png", contentType: "text/x-evil", size: 1 }],
  ["upload empty", requestUploadSchema, { taskId: ID, fileName: "a.png", contentType: "image/png", size: 0 }],
  ["upload too big", requestUploadSchema, { taskId: ID, fileName: "a.png", contentType: "image/png", size: MAX_ATTACHMENT_BYTES + 1 }],
  ["sign-up reserved email", signUpSchema, { email: "a@demo.invalid", password: "long-enough-pass", name: "N" }],
  ["sign-up bad email", signUpSchema, { email: "nope", password: "long-enough-pass", name: "N" }],
  ["sign-up short password", signUpSchema, { email: "a@b.co", password: "a", name: "N" }],
  ["sign-up empty name", signUpSchema, { email: "a@b.co", password: "long-enough-pass", name: "" }],
  ["invite bad email", addMemberByEmailSchema, { boardId: ID, email: "nope", role: "member" }],
  ["task title empty", createTaskSchema, { stageId: ID, title: "" }],
  ["task title long", createTaskSchema, { stageId: ID, title: "x".repeat(121) }],
  ["stage name empty", createStageSchema, { pipelineId: ID, name: "" }],
];

function issuesOf(schema: Parameters<typeof parseInput>[0], input: unknown) {
  try {
    parseInput(schema, input);
  } catch (error) {
    if (error instanceof ValidationError) return error;
  }
  throw new Error("expected a ValidationError");
}

describe("validation reasons of the real schemas", () => {
  it.each(CASES)("%s: every message has a reason whose English text is the message itself", (_label, schema, input) => {
    const error = issuesOf(schema, input);
    const checked: string[] = [];
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      messages.forEach((message, index) => {
        const detail = error.fieldReasons[field]?.[index];
        expect(detail, `${field}: ${message}`).toBeTruthy();
        expect(render(en, "en", detail!), `${detail!.reason} in en`).toBe(message);
        checked.push(detail!.reason);
      });
    }
    expect(checked.length).toBeGreaterThan(0);
  });

  it.each(CASES)("%s: es has the same key, placeholders and a different text", (_label, schema, input) => {
    const error = issuesOf(schema, input);
    for (const details of Object.values(error.fieldReasons)) {
      for (const detail of details) {
        const english = raw(en, detail!.reason);
        const spanish = raw(es, detail!.reason);
        expect(spanish, `${detail!.reason} in es`).toBeTypeOf("string");
        expect(placeholders(spanish!)).toBe(placeholders(english!));
        expect(render(es, "es", detail!)).not.toBe(render(en, "en", detail!));
      }
    }
  });

  it("scopes a reason to its field, so colliding field names cannot share a wrong text", () => {
    // `name` means different things per schema: custom wording is field-scoped, Zod's default wording is generic.
    expect(issuesOf(createBoardSchema, { name: " " }).fieldReasons.name).toEqual([{ reason: "name.tooSmall", params: { min: 1 } }]);
    expect(issuesOf(createStageSchema, { pipelineId: ID, name: "" }).fieldReasons.name).toEqual([{ reason: "stageName.required" }]);
  });

  it("words the upload limit from the policy, not from a literal", () => {
    const error = issuesOf(requestUploadSchema, { taskId: ID, fileName: "a.png", contentType: "image/png", size: MAX_ATTACHMENT_BYTES + 1 });
    expect(error.fieldReasons.size).toEqual([{ reason: "size.tooBig", params: { max: MAX_ATTACHMENT_BYTES, maxMb: MAX_ATTACHMENT_BYTES / (1024 * 1024) } }]);
    expect(render(es, "es", error.fieldReasons.size![0]!)).toBe(`Los archivos pueden pesar como máximo ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
  });

  it("pluralizes the Spanish bounds and leaves the English wording exactly as Zod writes it", () => {
    expect(render(es, "es", { reason: "tooSmall", params: { min: 1 } })).toBe("Demasiado corto: se esperaban al menos 1 carácter");
    expect(render(es, "es", { reason: "tooBig", params: { max: 3 } })).toBe("Demasiado largo: se esperaban como máximo 3 caracteres");
    expect(render(en, "en", { reason: "tooSmall", params: { min: 1 } })).toBe("Too small: expected string to have >=1 characters");
  });
});
