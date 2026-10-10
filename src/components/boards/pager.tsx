import Link from "next/link";

interface PagerProps {
  page: number;
  hasNext: boolean;
  basePath: string;
  /** Query parameter that carries this list's page; pages sharing a URL use different names. */
  param?: string;
  /** Other query parameters to keep, such as the page of a second list on the same screen. */
  preserve?: Record<string, string>;
}

/** URL of `page` for a list whose page lives in `param`; page 1 carries no parameter. */
export function hrefFor({ basePath, param = "page", preserve = {} }: Pick<PagerProps, "basePath" | "param" | "preserve">, page: number): string {
  const query = new URLSearchParams(Object.entries(preserve).filter(([, value]) => value !== ""));
  if (page > 1) query.set(param, String(page));
  const search = query.toString();
  return search ? `${basePath}?${search}` : basePath;
}

/** Previous/Next links; renders nothing when there is only one page. */
export function Pager({ page, hasNext, ...link }: PagerProps) {
  if (page <= 1 && !hasNext) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex justify-between text-sm">
      {page > 1 ? <Link href={hrefFor(link, page - 1)} className="underline">Previous</Link> : <span />}
      {hasNext ? <Link href={hrefFor(link, page + 1)} className="underline">Next</Link> : null}
    </nav>
  );
}

/** What a list shows when the requested page is past its end, instead of the "nothing yet" message. */
export function PastTheEnd({ what, href }: { what: string; href: string }) {
  return (
    <p className="text-sm text-gray-600">
      No {what} on this page. <Link href={href} className="underline">Go to the first page</Link>
    </p>
  );
}
