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

// Registered once per app lifetime — safe to call even if this screen mounts more than once.
let protocolRegistered = false;
function ensurePmtilesProtocol() {
    if (protocolRegistered) return;
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);
    protocolRegistered = true;
}

const DEFAULT_TILE_PATH = "/maps/test-region.pmtiles";
const SOURCE_NAME = "basemap";
const ROUTE_SOURCE_ID = "traced-route";
const ROUTE_LAYER_ID = "traced-route-line";

interface Point {
    lng: number;
    lat: number;
}

/** Great-circle distance between two lng/lat points, in kilometers (Haversine). */
function haversineKm(a: Point, b: Point): number {
    const R = 6371; // Earth radius, km
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

function totalDistanceKm(points: Point[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += haversineKm(points[i - 1], points[i]);
    }
    return total;
}

type LineStringFeature = {
    type: "Feature";
    properties: Record<string, never>;
    geometry: {
        type: "LineString";
        coordinates: [number, number][];
    };
};

function routeGeoJson(points: Point[]): LineStringFeature {
    return {
        type: "Feature",
        properties: {},
        geometry: {
            type: "LineString",
            coordinates: points.map((p) => [p.lng, p.lat] as [number, number]),
        },
    };
}

/** Standalone test screen: trace a route on a free, fully-offline vector basemap
 *  (OpenStreetMap data via a locally-hosted PMTiles file, rendered with MapLibre GL
 *  and Protomaps' open basemap style — no Mapbox/Google, no network calls at runtime)
 *  and see the distance computed automatically from the traced path. Not wired into
 *  MR-I Reporting yet — this is purely to evaluate whether the approach is worth adopting. */
function DistanceMapTest() {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MaplibreMap | null>(null);
    const markersRef = useRef<Marker[]>([]);

    const [tilePath, setTilePath] = useState(DEFAULT_TILE_PATH);
    const [loadedTilePath, setLoadedTilePath] = useState(DEFAULT_TILE_PATH);
    const [mapError, setMapError] = useState<string | null>(null);
    const [points, setPoints] = useState<Point[]>([]);

    // Create the map once per loaded tile path.
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
                        url: `pmtiles://${window.location.origin}${loadedTilePath}`,
                    },
                },
                layers: layers(SOURCE_NAME, flavor),
            },
            center: [55.27, 25.2], // roughly the UAE — harmless default if the loaded extract differs
            zoom: 6,
        });

        map.on("error", (e: MaplibreErrorEvent) => {
            // Most common cause here: the .pmtiles file isn't present at the given path yet.
            setMapError(`Map failed to load "${loadedTilePath}" — is the file in place? (${e.error?.message ?? "unknown error"})`);
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
            setPoints((prev) => [...prev, { lng: e.lngLat.lng, lat: e.lngLat.lat }]);
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadedTilePath]);

    // Keep the route line and the draggable markers in sync with `points`.
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

                const marker = new Marker({ color, draggable: true })
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
    }, [points]);

    const distanceKm = totalDistanceKm(points);

    function undoLastPoint() {
        setPoints((prev) => prev.slice(0, -1));
    }
    function clearPath() {
        setPoints([]);
    }
    function reloadTile() {
        setLoadedTilePath(tilePath);
    }

    return (
        <div>
            <div className="header">
                <h1>Distance Map (Test)</h1>
                <span className="sub">
                    Prototype only &mdash; not connected to MR-I Reporting. Trace a route on a fully offline map and see the
                    computed distance.
                </span>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <label style={{ fontSize: 12.5, color: "var(--text-soft)" }}>
                    PMTiles file (under <code>public/</code>):
                </label>
                <input
                    type="text"
                    className="trigger-input"
                    style={{ width: 260 }}
                    value={tilePath}
                    onChange={(e) => setTilePath(e.target.value)}
                />
                <button className="ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={reloadTile}>
                    Load
                </button>

                <div style={{ flex: 1 }} />

                <button className="ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={undoLastPoint} disabled={points.length === 0}>
                    Undo last point
                </button>
                <button className="ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={clearPath} disabled={points.length === 0}>
                    Clear path
                </button>
            </div>

            {mapError && (
                <div className="toast err" style={{ marginBottom: 12 }}>
                    {mapError}
                </div>
            )}

            <div
                ref={containerRef}
                style={{
                    width: "100%", height: 520, borderRadius: 16, overflow: "hidden",
                    boxShadow: "inset 3px 3px 8px var(--neu-shadow-dark), inset -3px -3px 8px var(--neu-shadow-light)",
                }}
            />

            <div style={{ display: "flex", gap: 24, alignItems: "center", marginTop: 12, fontSize: 13 }}>
                <span>
                    <strong>{points.length}</strong> point{points.length === 1 ? "" : "s"} placed
                </span>
                <span>
                    Traced distance: <strong>{distanceKm.toFixed(2)} km</strong>
                </span>
                <span style={{ color: "var(--text-soft)", fontSize: 12 }}>
                    Click the map to add a point (green = origin, red = destination). Drag any point to correct the path.
                </span>
            </div>
        </div>
    );
}

export default DistanceMapTest;