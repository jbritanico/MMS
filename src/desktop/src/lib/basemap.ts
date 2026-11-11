import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { addProtocol } from "maplibre-gl";
import { PMTiles, Protocol, type RangeResponse, type Source } from "pmtiles";

// The offline basemap (test-region.pmtiles, about 210 MB) ships next to the app as a bundle
// resource (src-tauri/resources/maps), not inside the web assets: the built-in app server
// cannot serve byte ranges, which pmtiles needs, while Tauri's asset protocol can.
//
// The map is registered under a short fixed name (pmtiles://mms-basemap) and its bytes are read
// by AssetFileSource below. The file path therefore never goes into a map URL: an installed path
// such as C:\Users\<name>\AppData\Local\Sprint MMS\... (backslashes, a space) made the map
// stay empty without any error, although the file itself could be read.
const RESOURCE_PATH = "resources/maps/test-region.pmtiles";
const FALLBACK_PATH = "/maps/test-region.pmtiles"; // old location; used only if the resource cannot be resolved
const BASEMAP_KEY = "mms-basemap";

let fileUrl = "";
let url = `pmtiles://${window.location.origin}${FALLBACK_PATH}`;

/** Reads byte ranges of the map file through the asset protocol. The protocol sends at most
 *  about 1 MB per answer, so longer reads are put together from several requests. */
class AssetFileSource implements Source {
    constructor(private readonly src: string) {}

    getKey(): string {
        return BASEMAP_KEY;
    }

    async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
        const out = new Uint8Array(length);
        let got = 0;
        while (got < length) {
            const start = offset + got;
            const end = offset + length - 1;
            const r = await fetch(this.src, { headers: { Range: `bytes=${start}-${end}` }, signal });
            if (r.status === 416) break; // asked past the end of the file
            if (r.status !== 206 && r.status !== 200) throw new Error(`Map file read failed: HTTP ${r.status}`);
            const buf = new Uint8Array(await r.arrayBuffer());
            if (r.status === 200) {
                // whole file returned: take the part that was asked for
                const part = buf.subarray(start, start + (length - got));
                out.set(part, got);
                got += part.byteLength;
                break;
            }
            if (buf.byteLength === 0) break;
            const take = Math.min(buf.byteLength, length - got);
            out.set(buf.subarray(0, take), got);
            got += take;
        }
        return { data: got === length ? out.buffer : out.buffer.slice(0, got) };
    }
}

let protocol: Protocol | null = null;

/** Registers the pmtiles:// protocol once for the whole app, with the offline basemap added. */
export function ensurePmtilesProtocol(): void {
    if (protocol) return;
    protocol = new Protocol();
    if (fileUrl) protocol.add(new PMTiles(new AssetFileSource(fileUrl)));
    addProtocol("pmtiles", protocol.tile);
}

// Resolved once before the app renders (see main.tsx).
export async function prepareBasemap(): Promise<void> {
    try {
        const file = await resolveResource(RESOURCE_PATH);
        fileUrl = convertFileSrc(file);
        url = `pmtiles://${BASEMAP_KEY}`;
    } catch (e) {
        console.warn(`Basemap resource not resolved; falling back to ${FALLBACK_PATH}`, e);
    }
}

export function basemapUrl(): string {
    return url;
}

export function hasWebGL2(): boolean {
    try {
        return !!document.createElement("canvas").getContext("webgl2");
    } catch {
        return false;
    }
}

// Plain-language report for when the map stays empty: which file it tried, whether the file
// answered, and whether this computer's graphics allow the map (WebGL2).
export async function diagnoseBasemap(): Promise<string> {
    const target = fileUrl || url.replace(/^pmtiles:\/\//, "");
    let check: string;
    try {
        const r = await fetch(target, { headers: { Range: "bytes=0-126" } });
        const b = await r.arrayBuffer();
        check = `HTTP ${r.status}, ${b.byteLength} bytes`;
    } catch (e) {
        check = `request failed (${String(e)})`;
    }
    return `The map did not load. Map file: ${decodeURIComponent(target)}. File check: ${check}. WebGL2: ${hasWebGL2() ? "available" : "not available"}.`;
}
