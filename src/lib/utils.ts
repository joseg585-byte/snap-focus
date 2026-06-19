// Tiny classname joiner. Avoids pulling clsx/tailwind-merge into the scaffold;
// good enough for the static composition we do here.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
