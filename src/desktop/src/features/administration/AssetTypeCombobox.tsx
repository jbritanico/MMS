import { useState, useRef, useEffect } from "react";
import type { AssetType } from "./hooks/useAssetTypes";

interface AssetTypeComboboxProps {
  assetTypes: AssetType[];
  value: string;
  onChange: (id: string) => void;
  /** FB-028: marks the box as required and shows it as missing when `invalid` is true. */
  required?: boolean;
  invalid?: boolean;
}

function AssetTypeCombobox({ assetTypes, value, onChange, required, invalid }: AssetTypeComboboxProps) {
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

  // FB-028: the whole list shows when the box opens, in A-Z order; typing narrows it.
  const filtered = assetTypes
    .filter((a) => a.active)
    .filter((a) => a.description.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.description.localeCompare(b.description));

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
        placeholder="Choose from the list, or type to search"
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        style={{ paddingRight: 34, ...(invalid ? { borderColor: "var(--danger)", boxShadow: "0 0 0 1px var(--danger)" } : {}) }}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); setQuery(""); }
          if (e.key === "Enter" && filtered.length === 1) selectItem(filtered[0]);
        }}
      />
      <button
        type="button"
        className="ghost"
        aria-label={open ? "Close the list" : "Show all asset types"}
        title={open ? "Close the list" : "Show all asset types"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { setOpen((o) => !o); setQuery(""); }}
        style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", padding: "2px 8px", minHeight: 0, lineHeight: 1 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
        </svg>
      </button>
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