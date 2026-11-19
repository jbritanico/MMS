// Fluent 2 design tokens: one source for the dashboards (.fl-shell) and the "Fluent" theme.
// Colours are derived from the active theme's tokens (--accent-blue, --surface, --text ...),
// so the dashboards keep working in every theme. Change a value here and both places follow.
export const FL_TOKENS = `
  --fl-blue: var(--accent-blue, #2f6fed);
  --fl-navy: var(--accent-blue-deep, #1a4d8f);
  --fl-teal: var(--accent, #0f6e56);
  --fl-cyan: color-mix(in oklab, var(--fl-blue) 50%, var(--fl-teal));
  --fl-green: var(--success, #1f7a4d);
  --fl-amber: var(--st-amber, var(--warn, #d97706));
  --fl-red: var(--danger, #a32d2d);
  --fl-violet: var(--chart-violet, #7c61cc);
  --fl-bg: color-mix(in srgb, var(--fl-blue) 6%, var(--bg, #f3f4f5));
  --fl-card: var(--surface, #fff);
  --fl-line: color-mix(in srgb, var(--text, #1a1d1f) 9%, transparent);
  --fl-soft: color-mix(in srgb, var(--fl-blue) 8%, var(--fl-card));
  --fl-shadow-1: 0 1px 2px color-mix(in srgb, var(--fl-navy) 7%, transparent), 0 4px 16px color-mix(in srgb, var(--fl-navy) 7%, transparent);
  --fl-shadow-2: 0 2px 6px color-mix(in srgb, var(--fl-navy) 9%, transparent), 0 16px 36px color-mix(in srgb, var(--fl-navy) 13%, transparent);
  --fl-r-xl: 24px; --fl-r-lg: 20px; --fl-r-md: 14px; --fl-r-sm: 10px; --fl-r-xs: 8px;
  --fl-s1: 4px; --fl-s2: 8px; --fl-s3: 12px; --fl-s4: 16px; --fl-s5: 20px; --fl-s6: 24px; --fl-s8: 32px;
  --fl-t-cap: 12px; --fl-t-body: 13.5px; --fl-t-sub: 15px; --fl-t-title: 17px; --fl-t-h2: 24px; --fl-t-h1: 26px; --fl-t-kpi: 34px;
  --fl-font: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", Aptos, var(--sans, system-ui), sans-serif;
  --fl-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --fl-side-w: 272px;
`;
