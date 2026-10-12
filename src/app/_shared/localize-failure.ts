import { getTranslations } from "next-intl/server";
import { DEFAULT_MESSAGES } from "@/application/errors";
import type { ActionFailure, ActionResult } from "@/application/result";

/** The `errors` namespace as a server translator. That namespace is server-only: it is never sent to the browser. */
export type ErrorsTranslator = ((key: string, values?: Record<string, string | number>) => string) & { has(key: string): boolean };

/**
 * Puts a failure in the visitor's language. Chain per message: its reason, then the English text the throw site wrote, and
 * the code's default only for a failure with no reason and the default message. What it returns is the client contract (`message`, `fieldErrors`, `retryAfterSeconds`): the
 * reasons are consumed here and never travel. REST does not pass through here, so its bodies stay English.
 */
export function localizeFailure(failure: ActionFailure, t: ErrorsTranslator): ActionFailure {
  const { reason, params, fieldReasons, ...rest } = failure;
  const pick = (key: string) => (t.has(key) ? t(key, params) : undefined);
  const localized: ActionFailure = {
    ...rest,
    // Reason, then the throw site's own English text; the code default only stands in for a site with nothing specific to say.
    message: (reason && pick(`reason.${reason}`)) || (!reason && failure.message === DEFAULT_MESSAGES[failure.code] ? pick(`code.${failure.code}`) : undefined) || failure.message,
  };
  if (failure.fieldErrors) {
    const fieldErrors: NonNullable<ActionFailure["fieldErrors"]> = {};
    for (const [field, messages] of Object.entries(failure.fieldErrors)) {
      fieldErrors[field] = messages.map((message, index) => {
        const detail = fieldReasons?.[field]?.[index];
        const key = detail && `validation.${detail.reason}`;
        return key && t.has(key) ? t(key, detail.params) : message;
      });
    }
    localized.fieldErrors = fieldErrors;
  }
  return localized;
}

/** The chokepoint form: translate a failure with the request's locale. */
export async function localizeActionFailure(failure: ActionFailure): Promise<ActionFailure> {
  try {
    return localizeFailure(failure, (await getTranslations("errors")) as unknown as ErrorsTranslator);
  } catch {
    // A refusal must still reach the visitor if translating it fails: the English text is better than a second error.
    const english = { ...failure };
    delete english.reason;
    delete english.params;
    delete english.fieldReasons;
    return english;
  }
}

/** Same for a result: successes pass through untouched. */
export async function localizeResult<T>(result: ActionResult<T>): Promise<ActionResult<T>> {
  return result.ok ? result : localizeActionFailure(result);
}
