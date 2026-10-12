"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_THEME, type Theme } from "@/theme/config";

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

/** Hands the cookie's theme (read on the server) to client components such as the Preferences menu. */
export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
