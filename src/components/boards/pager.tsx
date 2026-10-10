import Link from "next/link";

interface PagerProps {
  page: number;
  hasNext: boolean;
  basePath: string;
}

const href = (basePath: string, page: number) => (page <= 1 ? basePath : `${basePath}?page=${page}`);

/** Previous/Next links; renders nothing when there is only one page. */
export function Pager({ page, hasNext, basePath }: PagerProps) {
  if (page <= 1 && !hasNext) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex justify-between text-sm">
      {page > 1 ? <Link href={href(basePath, page - 1)} className="underline">Previous</Link> : <span />}
      {hasNext ? <Link href={href(basePath, page + 1)} className="underline">Next</Link> : null}
    </nav>
  );
}
