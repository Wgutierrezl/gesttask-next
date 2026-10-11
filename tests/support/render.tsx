import { renderToStaticMarkup } from "react-dom/server";
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

type Locale = "en" | "es";
const CATALOGS = { en, es } as const;

interface IntlOptions {
  locale?: Locale;
  messages?: typeof en;
}

/** Wraps `ui` in the same provider the root layout mounts, so components under test can call `useTranslations`. */
export function withIntl(ui: ReactNode, { locale = "en", messages = CATALOGS[locale] }: IntlOptions = {}): ReactElement {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

/** `render` from Testing Library inside the intl provider (as a wrapper, so `rerender` keeps it); copy is the real catalog. */
export function renderWithIntl(ui: ReactNode, options?: IntlOptions & Omit<RenderOptions, "wrapper">) {
  const { locale = "en", messages, ...renderOptions } = options ?? {};
  const wrapper = ({ children }: { children: ReactNode }) => withIntl(children, { locale, messages });
  return render(ui, { ...renderOptions, wrapper });
}

/** `renderToStaticMarkup` inside the intl provider, for the server-render assertions. */
export function renderToStaticMarkupWithIntl(ui: ReactNode, options?: IntlOptions): string {
  return renderToStaticMarkup(withIntl(ui, options));
}
