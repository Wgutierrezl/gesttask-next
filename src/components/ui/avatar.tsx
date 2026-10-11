import { cn } from "./cn";

const SIZES = { sm: "size-6 text-[10px]", md: "size-8 text-xs" } as const;

function hueOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function initialsOf(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]!.toUpperCase());
  return letters.join("") || "?";
}

/** Decorative initials; the person's name is always rendered as text next to it. */
export function Avatar({ name, size = "md" }: { name: string; size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden="true"
      title={name}
      style={{ backgroundColor: `hsl(${hueOf(name)} 60% 90%)`, color: `hsl(${hueOf(name)} 60% 25%)` }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-pill font-semibold", SIZES[size])}
    >
      {initialsOf(name)}
    </span>
  );
}
