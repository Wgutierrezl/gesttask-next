import type { ReactNode } from "react";

/** A section's title like v1's: a small blue glyph before an h2, which the section names itself by through `id`. */
export function SectionTitle({ id, icon, children }: { id: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex text-icon-fg [&>svg]:size-5">{icon}</span>
      <h2 id={id} className="text-xl text-fg">{children}</h2>
    </div>
  );
}
