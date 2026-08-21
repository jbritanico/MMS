import { useState, useEffect, useRef } from "react";
import { useIconSearch, fetchIconSvg } from "./hooks/useIconSearch";

interface IconPickerProps {
  onSelect: (svg: string) => void;
  onClose: () => void;
}

function IconPicker({ onSelect, onClose }: IconPickerProps) {
  const [query, setQuery] = useState("");
  const { results, loading, error, search } = useIconSearch();
  const [picking, setPicking] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(query);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  async function handlePick(iconId: string) {
    setPicking(iconId);
    try {
      const svg = await fetchIconSvg(iconId);
      onSelect(svg);
    } catch (err) {
      // surfaced via parent's own status handling if needed
      console.error(err);
    } finally {
      setPicking(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: "min(560px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <h3>Choose an icon</h3>
        <p style={{ marginTop: -4 }}>Searches thousands of free icons via Iconify. Requires an internet connection.</p>

        <input
          type="text"
          className="trigger-input"
          placeholder="Search e.g. pump, valve, truck, tank..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          style={{ marginBottom: 14 }}
        />

        {loading && <div className="empty">Searching...</div>}
        {error && <div className="toast err">{error}</div>}

        {!loading && !error && query.trim() && results.length === 0 && (
          <div className="empty">No icons found for "{query}"</div>
        )}

        {results.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
              gap: 8,
              maxHeight: 320,
              overflowY: "auto",
              marginBottom: 14,
            }}
          >
            {results.map((iconId) => (
              <button
                key={iconId}
                className="ghost"
                onClick={() => handlePick(iconId)}
                disabled={picking !== null}
                title={iconId}
                style={{
                  width: 56, height: 56, padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: picking === iconId ? 0.5 : 1,
                }}
              >
                <img
                  src={`https://api.iconify.design/${iconId}.svg`}
                  alt={iconId}
                  width={28}
                  height={28}
                  style={{ filter: "var(--icon-filter, none)" }}
                />
              </button>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default IconPicker;