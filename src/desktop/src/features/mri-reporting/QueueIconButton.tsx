import type { ReactNode } from "react";

// Round icon-only button for the review queues. The label is shown as a tooltip on hover
// and read out by screen readers, so the card stays compact.
const sv = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const QUEUE_ICONS: Record<string, ReactNode> = {
  // Endorse: rubber stamp
  endorse: (
    <svg {...sv}>
      <path d="M9 13V9a3 3 0 1 1 6 0v4" />
      <path d="M5 13h14l1 4H4z" />
      <path d="M6 21h12" />
    </svg>
  ),
  // Close: check inside a circle
  close: (
    <svg {...sv}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  ),
  // Review / view: eye
  view: (
    <svg {...sv}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  // Show flow: three connected boxes
  flow: (
    <svg {...sv}>
      <rect x="3" y="4" width="6" height="5" rx="1" />
      <rect x="15" y="4" width="6" height="5" rx="1" />
      <rect x="9" y="15" width="6" height="5" rx="1" />
      <path d="M9 6.5h6M18 9v3H12v3" />
    </svg>
  ),
};

export function QueueIconButton({
  icon,
  label,
  onClick,
  primary = false,
}: {
  icon: keyof typeof QUEUE_ICONS;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`queue-icon-btn${primary ? " primary" : " ghost"}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {QUEUE_ICONS[icon]}
    </button>
  );
}

// Styles shared by the queue screens; render once per screen.
export const QUEUE_ICON_CSS = `
  .queue-icon-row { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 6px; }
  button.queue-icon-btn { width: 40px; height: 40px; padding: 0; border-radius: 50%; display: inline-grid; place-items: center; flex: none; }
  button.queue-icon-btn svg { width: 19px; height: 19px; }
  button.queue-icon-btn.primary { color: var(--accent-blue, #2f6fed); }
  button.queue-icon-btn.ghost { color: var(--text-soft); }
`;
