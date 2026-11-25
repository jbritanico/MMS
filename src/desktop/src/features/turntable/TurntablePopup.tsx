import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Main menu › side drawer › More › Turntable: a centred popup (half the app window's width and
// height) where a WebP or GIF picture is chosen and shown. The picture stays only while the
// popup is open; nothing is saved to the database.

const ALLOWED = ["image/webp", "image/gif"];
const isAllowed = (f: File) => ALLOWED.includes(f.type) || /\.(webp|gif)$/i.test(f.name);

const TT_CSS = `
.tt-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
  background: rgba(10, 16, 24, 0.45); }
.tt-pop { width: 50vw; height: 50vh; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
  background: var(--surface, #fff); color: var(--text, #1a1d1f); border: 1px solid var(--border, #d6dde6);
  border-radius: 14px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.3); }
.tt-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border, #d6dde6); }
.tt-head h3 { margin: 0; font-size: 15px; flex: 1; min-width: 0; }
.tt-name { font-size: 12px; color: var(--text-soft, #5b6670); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
.tt-body { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 12px; box-sizing: border-box; }
.tt-body img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.tt-drop { width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; align-items: center;
  justify-content: center; text-align: center; border: 2px dashed var(--border, #d6dde6); border-radius: 12px;
  color: var(--text-soft, #5b6670); font-size: 13px; padding: 12px; }
.tt-drop.over { border-color: var(--accent-blue, #2f6fed); color: var(--text, #1a1d1f); }
.tt-err { margin: 0 14px 10px; font-size: 12.5px; color: var(--danger, #c62828); }
`;

export default function TurntablePopup({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pic, setPic] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  // Free the picture's memory when it is replaced or the popup closes.
  useEffect(() => () => { if (pic) URL.revokeObjectURL(pic.url); }, [pic]);

  function show(file: File | undefined) {
    if (!file) return;
    if (!isAllowed(file)) { setError("Choose a WebP or GIF file."); return; }
    setError(null);
    setPic({ url: URL.createObjectURL(file), name: file.name });
  }

  return createPortal(
    <div className="tt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{TT_CSS}</style>
      <div className="tt-pop" role="dialog" aria-modal="true" aria-label="Turntable">
        <div className="tt-head">
          <h3>Turntable</h3>
          {pic && <span className="tt-name" title={pic.name}>{pic.name}</span>}
          <button type="button" className="primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => inputRef.current?.click()}>
            {pic ? "Choose another" : "Upload WebP or GIF"}
          </button>
          <button type="button" className="ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={onClose} aria-label="Close">Close</button>
          <input ref={inputRef} type="file" accept=".webp,.gif,image/webp,image/gif" hidden
            onChange={(e) => { show(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <div className="tt-body"
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); show(e.dataTransfer.files?.[0]); }}>
          {pic ? <img src={pic.url} alt={pic.name} /> : (
            <div className={`tt-drop${over ? " over" : ""}`}>
              <span>Drop a WebP or GIF picture here, or</span>
              <button type="button" className="ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => inputRef.current?.click()}>Choose a file</button>
            </div>
          )}
        </div>
        {error && <p className="tt-err" role="alert">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
