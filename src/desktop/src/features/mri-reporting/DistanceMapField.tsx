import { useEffect, useRef, useState } from "react";
import {
    addProtocol,
    GeoJSONSource,
    Map as MaplibreMap,
    Marker,
    NavigationControl,
    type LngLatLike,
    type MapMouseEvent,
    type ErrorEvent as MaplibreErrorEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";

let protocolRegistered = false;
function ensurePmtilesProtocol() {
    if (protocolRegistered) return;
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);
    protocolRegistered = true;
}

const DEFAULT_TILE_PATH = "/maps/test-region.pmtiles";
const SOURCE_NAME = "basemap";
const ROUTE_SOURCE_ID = "distance-field-route";
const ROUTE_LAYER_ID = "distance-field-route-line";
const AUTOSAVE_DEBOUNCE_MS = 700;

export interface DistanceMapPoint {
    lng: number;
    lat: number;
}

interface LineStringFeature {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: { type: "LineString"; coordinates: number[][] };
}

/** Great-circle distance between two lng/lat points, in kilometers (Haversine). */
function haversineKm(a: DistanceMapPoint, b: DistanceMapPoint): number {
    const R = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function totalDistanceKm(points: DistanceMapPoint[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += haversineKm(points[i - 1], points[i]);
    }
    return total;
}

function routeGeoJson(points: DistanceMapPoint[]): LineStringFeature {
    return {
        type: "Feature",
        properties: {},
        geometry: {
            type: "LineString",
            coordinates: points.map((p) => [p.lng, p.lat]),
        },
    };
}

/** Compact map-plotting widget for MR-I Reporting's Distance Travelled field.
 *  Lets the user drop points on an offline vector basemap and computes the
 *  straight-line (haversine) distance between them. Seeds itself from
 *  `initialPoints` (the last saved route) and auto-saves (debounced) via
 *  `onChange` every time the plotted path changes, so navigating away and
 *  back doesn't lose the route or the computed distance. */
function DistanceMapField({
    initialPoints,
    locked,
    onChange,
}: {
    initialPoints?: DistanceMapPoint[];
    locked: boolean;
    onChange: (points: DistanceMapPoint[], km: number) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MaplibreMap | null>(null);
    const markersRef = useRef<Marker[]>([]);

    const [mapError, setMapError] = useState<string | null>(null);
    const [points, setPoints] = useState<DistanceMapPoint[]>(() => initialPoints ?? []);
    const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saved">("idle");
    const isFirstChange = useRef(true);

    useEffect(() => {
        if (!containerRef.current) return;
        ensurePmtilesProtocol();
        setMapError(null);

        const flavor = namedFlavor("light");
        const map = new MaplibreMap({
            container: containerRef.current,
            style: {
                version: 8,
                sources: {
                    [SOURCE_NAME]: {
                        type: "vector",
                        url: `pmtiles://${window.location.origin}${DEFAULT_TILE_PATH}`,
                    },
                },
                layers: layers(SOURCE_NAME, flavor),
            },
            center: [55.27, 25.2],
            zoom: 6,
        });

        map.on("error", (e: MaplibreErrorEvent) => {
            setMapError(`Map failed to load — is the basemap file in place? (${e.error?.message ?? "unknown error"})`);
        });

        map.addControl(new NavigationControl({ showCompass: false }), "top-right");

        map.on("load", () => {
            map.addSource(ROUTE_SOURCE_ID, {
                type: "geojson",
                data: routeGeoJson([]),
            });
            map.addLayer({
                id: ROUTE_LAYER_ID,
                type: "line",
                source: ROUTE_SOURCE_ID,
                layout: { "line-cap": "round", "line-join": "round" },
                paint: { "line-color": "#2f6fed", "line-width": 4, "line-opacity": 0.85 },
            });
        });

        map.on("click", (e: MapMouseEvent) => {
            if (locked) return;
            setPoints((prev) => [...prev, { lng: e.lngLat.lng, lat: e.lngLat.lat }]);
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        function redraw() {
            const source = map!.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
            source?.setData(routeGeoJson(points));

            markersRef.current.forEach((m) => m.remove());
            markersRef.current = points.map((p, i) => {
                const isOrigin = i === 0;
                const isDestination = i === points.length - 1 && points.length > 1;
                const color = isOrigin ? "#2f9e44" : isDestination ? "#c0392b" : "#2f6fed";

                const marker = new Marker({ color, draggable: !locked })
                    .setLngLat([p.lng, p.lat] as LngLatLike)
                    .addTo(map!);

                marker.on("dragend", () => {
                    const { lng, lat } = marker.getLngLat();
                    setPoints((prev) => prev.map((pt, idx) => (idx === i ? { lng, lat } : pt)));
                });

                return marker;
            });
        }

        if (map.isStyleLoaded() && map.getSource(ROUTE_SOURCE_ID)) {
            redraw();
        } else {
            map.once("load", redraw);
        }
    }, [points, locked]);

    // Auto-save (debounced) whenever the plotted path changes, so a stray
    // navigation away doesn't require an explicit "apply" step to keep the work.
    useEffect(() => {
        if (isFirstChange.current) {
            isFirstChange.current = false;
            return;
        }
        if (locked) return;

        setSaveStatus("pending");
        const handle = setTimeout(() => {
            const km = Math.round(totalDistanceKm(points) * 100) / 100;
            onChange(points, km);
            setSaveStatus("saved");
        }, AUTOSAVE_DEBOUNCE_MS);

        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, locked]);

    const distanceKm = totalDistanceKm(points);

    function undoLastPoint() {
        setPoints((prev) => prev.slice(0, -1));
    }
    function clearPath() {
        setPoints([]);
    }

    return (
        <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-soft)" }}>
                    Click the map to plot points (green = origin, red = destination). Drag a point to correct it.
                </span>
                <div style={{ flex: 1 }} />
                <button className="ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={undoLastPoint} disabled={locked || points.length === 0}>
                    Undo last point
                </button>
                <button className="ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={clearPath} disabled={locked || points.length === 0}>
                    Clear path
                </button>
            </div>

            {mapError && (
                <div className="toast err" style={{ marginBottom: 8 }}>
                    {mapError}
                </div>
            )}

            <div
                ref={containerRef}
                style={{
                    width: "100%", height: 320, borderRadius: 14, overflow: "hidden",
                    boxShadow: "inset 3px 3px 8px var(--neu-shadow-dark), inset -3px -3px 8px var(--neu-shadow-light)",
                }}
            />

            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 10, fontSize: 13 }}>
                <span>
                    <strong>{points.length}</strong> point{points.length === 1 ? "" : "s"} placed
                </span>
                <span>
                    Plotted distance: <strong>{distanceKm.toFixed(2)} km</strong>
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: "var(--text-soft)" }}>
                    {saveStatus === "pending" ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}
                </span>
            </div>
        </div>
    );
}

export default DistanceMapField;