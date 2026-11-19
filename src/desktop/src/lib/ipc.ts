import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { diag } from "./support/diag";

// Every call to the Rust side goes through here, so the support tools can record how long it
// took and whether it failed (command log, error details, app log file).
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const started = performance.now();
    diag.ipcStart();
    try {
        const result = await tauriInvoke<T>(command, args);
        diag.ipcDone(command, args, performance.now() - started, true, result);
        return result;
    } catch (err) {
        diag.ipcDone(command, args, performance.now() - started, false, undefined, String(err));
        throw err;
    }
}
