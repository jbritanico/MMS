import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Modal error dialog: drawn above every other control (including other modals), and the
// rest of the app is made inert while it is open, so keyboard focus and clicks stay on the
// dialog until the user presses OK. Focus returns to where it was when the dialog closes.
export default function ErrorDialog({
  message,
  title = "Cannot continue",
  onClose,
}: {
  message: string;
  title?: string;
  onClose: () => void;
}) {
  const okRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    okRef.current?.focus();

    // Keep Tab / Shift+Tab inside the dialog (it has a single button, so focus stays on OK).
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        okRef.current?.focus();
      }
      if (e.key === "Escape") {
        // Escape does not dismiss: the user must acknowledge the error with OK.
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", trap, true);
    return () => {
      document.removeEventListener("keydown", trap, true);
      if (root) root.inert = wasInert;
      previous?.focus?.();
    };
  }, []);

  // The dialog is rendered outside #root (which is made inert), so it copies the app
  // shell's class and theme to get the same fonts, colours and macOS styling.
  const appEl = document.querySelector(".app") as HTMLElement | null;

  return createPortal(
    <div
      className={appEl?.className ?? "app"}
      data-theme={appEl?.dataset.theme}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "transparent", width: "auto", height: "auto", overflow: "visible" }}
    >
    <div
      className="modal-overlay"
      style={{ zIndex: 10000, position: "fixed", inset: 0 }}
      onMouseDown={(e) => {
        // Clicking the backdrop keeps focus on the dialog instead of closing it.
        e.preventDefault();
        okRef.current?.focus();
      }}
    >
      <div
        ref={boxRef}
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-dialog-title"
        aria-describedby="error-dialog-message"
        style={{ width: "min(440px, 92vw)", textAlign: "left", borderTop: "4px solid var(--danger)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="error-dialog-title" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 0, color: "var(--danger)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 7v6M12 16.5h.01" />
          </svg>
          {title}
        </h3>
        <p id="error-dialog-message" style={{ whiteSpace: "pre-wrap", margin: "8px 0 18px", color: "var(--text)" }}>
          {message}
        </p>
        <div className="modal-actions">
          <button ref={okRef} className="primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
    </div>,
    document.body,
  );
}
