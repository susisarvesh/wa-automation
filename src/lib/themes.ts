/**
 * Vsmart Technologies brand theme.
 * Palette mirrors https://vsmarttec.com/ — blue #3659c9 + orange #f97316.
 */

export const THEME_IDS = ["vsmart"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "vsmart";

export const STORAGE_KEY = "vsmart.theme";

export const MODES = ["light", "dark"] as const;

export type Mode = (typeof MODES)[number];

/** Site default is a cool light canvas. */
export const DEFAULT_MODE: Mode = "light";

export const MODE_STORAGE_KEY = "vsmart.mode";

export function isMode(value: unknown): value is Mode {
  return (
    typeof value === "string" && (MODES as ReadonlyArray<string>).includes(value)
  );
}

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string;
}

export const THEMES: ReadonlyArray<ThemeMeta> = [
  {
    id: "vsmart",
    name: "Vsmart",
    tagline: "Brand blue from vsmarttec.com",
    swatch: "#3659c9",
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    (THEME_IDS as ReadonlyArray<string>).includes(value)
  );
}
