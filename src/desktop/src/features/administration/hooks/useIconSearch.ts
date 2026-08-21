import { useState, useCallback } from "react";
import { invoke } from "../../../lib/ipc";

export function useIconSearch() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const icons = await invoke<string[]>("search_icons", { query });
      setResults(icons);
    } catch (err) {
      setError(String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, error, search };
}

export async function fetchIconSvg(iconId: string): Promise<string> {
  return invoke<string>("fetch_icon_svg", { iconId });
}