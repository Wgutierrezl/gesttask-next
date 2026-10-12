"use client";

/**
 * Last resort when the root layout itself fails: there is no provider, no catalog and no theme here, so the text is
 * static and neutral, in both supported languages at once.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem" }}>
        <main>
          <h1>Something went wrong / Algo salió mal</h1>
          <p>An unexpected error occurred. / Ocurrió un error inesperado.</p>
          <button type="button" onClick={reset}>
            Try again / Intentar de nuevo
          </button>
        </main>
      </body>
    </html>
  );
}
