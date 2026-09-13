const STORAGE_KEY = "mms.mapFeatureEnabled";

export function isMapFeatureEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setMapFeatureEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // ignore storage errors (e.g. private/locked-down environments)
  }
}