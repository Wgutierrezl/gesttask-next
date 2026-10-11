import { useTranslations } from "next-intl";
import Link from "next/link";

/** Shown to demo-session users: what they are in, and the way out that keeps their data. */
export function GuestBanner() {
  const t = useTranslations("guest");
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-control border border-warning-600/30 bg-warning-50 px-4 py-2 text-sm text-warning-700">
      <span>{t("banner")}</span>
      <Link href="/register" className="font-medium underline">
        {t("createAccount")}
      </Link>
    </div>
  );
}
