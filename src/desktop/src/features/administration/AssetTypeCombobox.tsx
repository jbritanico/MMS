import { useState, useRef, useEffect } from "react";
import type { AssetType } from "./hooks/useAssetTypes";

interface AssetTypeComboboxProps {
  assetTypes: AssetType[];
  value: string;
  onChange: (id: string) => void;
}

function AssetTypeCombobox({ assetTypes, value, onChange }: AssetTypeComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = assetTypes.find((a) => String(a.id) === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = assetTypes
    .filter((a) => a.active)
    .filter((a) => a.description.toLowerCase().includes(query.toLowerCase()));

  function selectItem(a: AssetType) {
    onChange(String(a.id));
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={open ? query : (selected?.description ?? "")}
        placeholder="Search asset type..."
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); setQuery(""); }
          if (e.key === "Enter" && filtered.length === 1) selectItem(filtered[0]);
        }}
      />
      {open && (
        <div className="combobox-panel">
          {filtered.length === 0 ? (
            <div className="combobox-empty">No matching asset types</div>
          ) : (
            filtered.map((a) => (
              <div
                key={a.id}
                className={`combobox-option ${String(a.id) === value ? "active" : ""}`}
                onClick={() => selectItem(a)}
              >
                {a.description}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default AssetTypeCombobox;