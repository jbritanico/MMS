import { useRef, useState } from "react";

interface IconUploadProps {
  onSelect: (dataUrl: string) => void;
  onClose: () => void;
}

const MAX_SIZE_BYTES = 500 * 1024; // 500KB safety cap

function IconUpload({ onSelect, onClose }: IconUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isValidType = file.type === "image/png" || file.type === "image/x-icon" || file.name.toLowerCase().endsWith(".ico");
    if (!isValidType) {
      setError("Please choose a .png or .ico file");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("File is too large (max 500KB)");
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function confirm() {
    if (preview) onSelect(preview);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: "min(420px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <h3>Upload an icon</h3>
        <p style={{ marginTop: -4 }}>Choose a .png or .ico file (max 500KB). Works fully offline.</p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.ico,image/png,image/x-icon"
          style={{ display: "none" }}
          onChange={handleFile}
        />

        {preview ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, margin: "18px 0" }}>
            <div
              style={{
                width: 72, height: 72, borderRadius: 14,
                background: "var(--neu-bg)",
                boxShadow: "inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <img src={preview} alt="preview" style={{ width: 40, height: 40, objectFit: "contain" }} />
            </div>
            <button className="ghost" onClick={() => fileInputRef.current?.click()}>Choose a different file</button>
          </div>
        ) : (
          <button className="ghost" onClick={() => fileInputRef.current?.click()} style={{ width: "100%", margin: "14px 0" }}>
            Select .png or .ico file
          </button>
        )}

        {error && <div className="toast err">{error}</div>}

        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={confirm} disabled={!preview}>Use this icon</button>
        </div>
      </div>
    </div>
  );
}

export default IconUpload;