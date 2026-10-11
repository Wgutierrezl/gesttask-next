import { useId } from "react";

/** The fixed brand mark: it never changes with the theme, so its colors live here and not in the tokens. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  // useId yields ":r1:"; colons are legal in ids but not in every url(#...) consumer, so they are dropped.
  const gradient = `gt-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradient})`} />
      <g fill="#fff" opacity=".22">
        <rect x="11" y="13" width="12" height="38" rx="4" />
        <rect x="26" y="13" width="12" height="38" rx="4" />
        <rect x="41" y="13" width="12" height="38" rx="4" />
      </g>
      <g fill="#fff" opacity=".85">
        <rect x="13" y="16" width="8" height="6" rx="2" />
        <rect x="13" y="25" width="8" height="6" rx="2" />
        <rect x="13" y="34" width="8" height="6" rx="2" />
        <rect x="28" y="16" width="8" height="6" rx="2" />
        <rect x="28" y="25" width="8" height="6" rx="2" />
      </g>
      <circle cx="47" cy="22" r="6" fill="#fff" />
      <path d="M44.2 22.2l2 2 3.8-4" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Size of the mark (a Tailwind size class). */
  markClassName?: string;
  /** Wordmark text classes. Use `sr-only sm:not-sr-only` to show the mark alone on small screens. */
  wordmarkClassName?: string;
}

/** Mark plus the "GestTask" wordmark; the accessible name is the wordmark, so the mark is decorative. */
export function Logo({ className = "", markClassName = "size-7", wordmarkClassName = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={`${markClassName} shrink-0`} />
      <span className={`font-semibold tracking-tight ${wordmarkClassName}`}>
        <span className="text-fg">Gest</span>
        <span className="text-wordmark-gradient">Task</span>
      </span>
    </span>
  );
}
