import type { ReactNode } from "react";

/** The pipeline's board, plus the `@modal` slot where a task opens over it when reached from the board. */
export default function PipelineLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
