export type Theme = "light" | "dark" | "ocean" | "sepia" | "sprint";

export const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: "light", label: "Light", swatch: "#e7eaf0" },
  { id: "dark", label: "Dark", swatch: "#2a2d33" },
  { id: "ocean", label: "Ocean Blue", swatch: "#1c3a52" },
  { id: "sepia", label: "Warm Sepia", swatch: "#e8ddc9" },
  { id: "sprint", label: "Sprint", swatch: "#05a1c7" },
];