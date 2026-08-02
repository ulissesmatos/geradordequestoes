export const THEME_COOKIE = "theme";
export const THEME_OPTIONS = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_OPTIONS)[number];

export function parseThemePreference(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
