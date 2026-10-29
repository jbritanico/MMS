export type Theme = "light" | "dark" | "ocean" | "sepia" | "sprint" | "macos" | "macos-dark";

export const THEMES: { id: Theme; label: string; swatch: string; hidden?: boolean }[] = [
  { id: "light", label: "Light", swatch: "#e7eaf0" },
  { id: "dark", label: "Dark", swatch: "#2a2d33" },
  { id: "ocean", label: "Ocean Blue", swatch: "#1c3a52", hidden: true },
  { id: "sepia", label: "Warm Sepia", swatch: "#e8ddc9", hidden: true },
  { id: "sprint", label: "Sprint", swatch: "#05a1c7", hidden: true },
  { id: "macos", label: "macOS Light", swatch: "#ffffff" },
  { id: "macos-dark", label: "macOS Dark", swatch: "#2c2c2e", hidden: true },
];

// Themes shown in the picker. Hidden themes keep their CSS and can be re-enabled by removing "hidden: true" above.
export const VISIBLE_THEMES = THEMES.filter((t) => !t.hidden);

export function isDarkTheme(t: Theme): boolean {
  return t === "dark" || t === "macos-dark";
}
