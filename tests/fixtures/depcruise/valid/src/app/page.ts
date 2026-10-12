import { schema } from "../application/schema";
import { LOCALES } from "../i18n/config";
import { container } from "../infrastructure/container";
export const page = { schema, container, LOCALES };
