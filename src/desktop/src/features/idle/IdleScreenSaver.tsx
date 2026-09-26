import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  useAssetsWithMriHistorySummary,
  type AssetMriHistorySummaryRow,
} from "../dashboard/hooks/useMriHistory";
import { useMriReport } from "../mri-reporting/hooks/useMriReports";
import {
  useTemplateDrawing,
  useTemplateDrawingHotspots,
  type Hotspot,
} from "../mri-template-builder/hooks/useTemplateDrawing";
import { useTemplateChecklistItems } from "../mri-template-builder/hooks/useTemplateChecklistItems";
import { useChecklistItems } from "../administration/hooks/useChecklistDataBank";
import {
  useMriReportChecklistResults,
  useMriReportAttachments,
  useMriChecklistActions,
  type MriReportChecklistResult,
  type MriReportAttachment,
  type MriChecklistActionEntry,
} from "../mri-reporting/hooks/useMriReportValues";

interface IdleScreensaverProps {
  onClose: () => void;
}

// How long each asset stays on screen, and how often the "spotlighted" hotspot/finding
// within that asset advances -- both real MR-I data driven, no random content.
const ASSET_DURATION_MS = 20000;
const SPOTLIGHT_DURATION_MS = 6000;

const SEVERITY_GLOW: Record<string, string> = {
  Minor: "#d4ac0d",
  Moderate: "#d97706",
  Critical: "#e14b3f",
};
const PASS_GLOW = "#2f9e44";

interface ShowcaseItem {
  templateItemId: number;
  description: string;
  result: MriReportChecklistResult;
  hotspot: Hotspot | null;
  attachments: MriReportAttachment[];
  closingNote: MriChecklistActionEntry | null;
}

interface LinePoint {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function IdleScreensaver({ onClose }: IdleScreensaverProps) {
  const { data: assetRows = [] } = useAssetsWithMriHistorySummary();

  // Only assets that have actually been inspected at least once belong in the rotation --
  // an asset with no MR-I report yet has nothing real to showcase.
  const roster = useMemo(
    () => assetRows.filter((a) => a.report_count > 0 && a.latest_report_id !== null),
    [assetRows],
  );

  const [assetIndex, setAssetIndex] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (roster.length === 0) return;
    const timer = setInterval(() => {
      setAssetIndex((i) => (i + 1) % roster.length);
    }, ASSET_DURATION_MS);
    return () => clearInterval(timer);
  }, [roster.length]);

  useEffect(() => {
    if (roster.length > 0 && assetIndex >= roster.length) setAssetIndex(0);
  }, [roster.length, assetIndex]);

  const currentAsset = roster.length > 0 ? roster[assetIndex % roster.length] : null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#05070c",
        cursor: "pointer",
        overflow: "hidden",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes showcase-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .showcase-fade { animation: showcase-fade-in 1s ease both; }

        /* The whole scene sways gently on two axes like someone walking through the
           room and glancing at the board -- combined with each layer's own translateZ
           depth below, this produces real parallax: far layers barely move, near
           layers swing more, exactly like walking past a 3D display. */
        @keyframes walk-sway {
          0%   { transform: rotateY(-3deg)  rotateX(1deg)    translateZ(0px); }
          25%  { transform: rotateY(0.5deg) rotateX(-1.2deg) translateZ(14px); }
          50%  { transform: rotateY(3deg)   rotateX(1deg)    translateZ(0px); }
          75%  { transform: rotateY(0.5deg) rotateX(-1.2deg) translateZ(14px); }
          100% { transform: rotateY(-3deg)  rotateX(1deg)    translateZ(0px); }
        }
        .showcase-scene {
          animation: walk-sway 9s ease-in-out infinite;
          transform-style: preserve-3d;
        }

        @keyframes showcase-kenburns {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.12) translate(-1.5%, -1.5%); }
        }
        .showcase-bg-pan img {
          animation: showcase-kenburns 20s ease-in-out infinite alternate;
        }

        @keyframes hotspot-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.3); }
        }
        .hotspot-marker { position: absolute; }
        .hotspot-dot {
          display: block;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          box-shadow: 0 0 14px 4px currentColor;
          animation: hotspot-pulse 1.8s ease-in-out infinite;
          transform: translate(-50%, -50%);
        }
        .hotspot-marker-active .hotspot-dot {
          width: 20px;
          height: 20px;
          animation-duration: 0.9s;
        }
        @keyframes hotspot-ring {
          0% { opacity: 0.9; transform: translate(-50%, -50%) scale(0.6); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(3.2); }
        }
        .hotspot-marker-active .hotspot-ring {
          position: absolute;
          left: 0;
          top: 0;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: radial-gradient(circle, currentColor 0%, transparent 70%);
          animation: hotspot-ring 1.4s ease-out infinite;
        }

        @keyframes connector-dash {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
        .connector-line { animation: connector-dash 0.6s linear infinite; }

        @keyframes panel-slide-in {
          from { opacity: 0; transform: translateX(28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .showcase-panel {
          animation: panel-slide-in 0.5s ease both;
          background: rgba(10, 14, 20, 0.72);
          backdrop-filter: blur(10px);
          border-radius: 14px;
          padding: 18px 20px;
          color: #f2f4f6;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }
        .showcase-panel-scroll { max-height: 100%; overflow-y: auto; }
        .showcase-field { margin-top: 10px; }
        .showcase-field-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: rgba(255, 255, 255, 0.5);
          font-weight: 700;
        }
        .showcase-field-value {
          font-size: 13px;
          color: #f2f4f6;
          margin-top: 2px;
          line-height: 1.4;
        }
        .showcase-panel-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 10.5px;
          font-weight: 800;
          color: #10131a;
          margin-bottom: 8px;
        }
        .showcase-panel h3 { margin: 0 0 2px; font-size: 16px; }
        .showcase-panel-meta { font-size: 11px; color: rgba(255, 255, 255, 0.45); margin-bottom: 4px; }
        .showcase-panel-ok { margin-top: 8px; font-size: 12.5px; color: rgba(255, 255, 255, 0.6); }

        @keyframes attachment-pop {
          from { opacity: 0; transform: scale(0.7); }
          to { opacity: 1; transform: scale(1); }
        }
        .showcase-attachments { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .showcase-attachment-thumb {
          width: 56px;
          height: 56px;
          border-radius: 8px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: attachment-pop 0.4s ease both;
        }
        .showcase-attachment-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .showcase-attachment-file { font-size: 9px; font-weight: 800; color: rgba(255, 255, 255, 0.6); }

        @keyframes stat-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .showcase-stats {
          position: absolute;
          left: 24px;
          bottom: 60px;
          display: flex;
          align-items: center;
          gap: 18px;
          animation: stat-fade-in 0.6s ease both;
        }
        .showcase-stats-asset {
          font-size: 15px;
          font-weight: 800;
          color: #fff;
          letter-spacing: 0.02em;
          padding-right: 12px;
          border-right: 1px solid rgba(255, 255, 255, 0.2);
        }
        .showcase-stat-pill { display: flex; flex-direction: column; align-items: center; }
        .showcase-stat-value { font-size: 20px; font-weight: 800; color: #fff; }
        .showcase-stat-label {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 255, 255, 0.5);
        }
      `}</style>

      {currentAsset ? (
        <AssetShowcase key={currentAsset.asset_id} asset={currentAsset} />
      ) : (
        <EmptyShowcase />
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: "fixed",
          top: 20,
          right: 24,
          padding: "8px 16px",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(255,255,255,0.08)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
          zIndex: 2,
        }}
      >
        ✕ Back to work
      </button>
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 24,
          color: "rgba(255,255,255,0.35)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          zIndex: 2,
        }}
      >
        Idle · live MR-I showcase · click anywhere or press Esc to return
      </div>
    </div>,
    document.body,
  );
}

function EmptyShowcase() {
  return (
    <div
      className="showcase-fade"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 10,
        color: "rgba(255,255,255,0.55)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        No maintenance records yet
      </div>
      <div style={{ fontSize: 12.5 }}>Submit an MR-I report to bring this screen to life.</div>
    </div>
  );
}

function AssetShowcase({ asset }: { asset: AssetMriHistorySummaryRow }) {
  const reportId = asset.latest_report_id as number;
  const { data: report } = useMriReport(reportId);
  const templateId = report?.template_id ?? 0;

  const { data: drawing } = useTemplateDrawing(templateId);
  const { data: hotspots = [] } = useTemplateDrawingHotspots(templateId);
  const { data: templateItems = [] } = useTemplateChecklistItems(templateId);
  const { data: databank = [] } = useChecklistItems();
  const { data: results = [] } = useMriReportChecklistResults(reportId);
  const { data: attachments = [] } = useMriReportAttachments(reportId);
  const { data: closingActions = [] } = useMriChecklistActions(reportId);

  // Every assessed checklist item on this asset's latest report, paired with its
  // real description, its linked drawing hotspot (if any), its photo/document
  // attachments, and its permanent closing note -- exactly the data actually captured
  // during inspection, nothing synthetic.
  const showcaseItems = useMemo<ShowcaseItem[]>(() => {
    const items: ShowcaseItem[] = [];
    for (const ti of templateItems) {
      const result = results.find((r) => r.template_checklist_item_id === ti.id);
      if (!result || !result.status) continue;
      const info = databank.find((d) => d.id === ti.checklist_item_id);
      const hotspot = hotspots.find((h) => h.checklist_item_ids.includes(ti.id)) ?? null;
      items.push({
        templateItemId: ti.id,
        description: info?.description ?? "Checklist item",
        result,
        hotspot,
        attachments: attachments.filter((a) => a.template_checklist_item_id === ti.id),
        closingNote:
          closingActions.find((a) => a.checklist_item_id === ti.checklist_item_id) ?? null,
      });
    }
    return items;
  }, [templateItems, results, hotspots, attachments, closingActions, databank]);

  // Fail findings are more informative, so they lead the spotlight cycle -- but Pass
  // items still get their turn so an all-clear asset shows something too.
  const spotlightOrder = useMemo(() => {
    const fails = showcaseItems.filter((s) => s.result.status === "Fail");
    const passes = showcaseItems.filter((s) => s.result.status === "Pass");
    return [...fails, ...passes];
  }, [showcaseItems]);

  const [spotIndex, setSpotIndex] = useState(0);

  useEffect(() => {
    setSpotIndex(0);
  }, [reportId]);

  useEffect(() => {
    if (spotlightOrder.length <= 1) return;
    const timer = setInterval(() => {
      setSpotIndex((i) => (i + 1) % spotlightOrder.length);
    }, SPOTLIGHT_DURATION_MS);
    return () => clearInterval(timer);
  }, [spotlightOrder.length]);

  const active =
    spotlightOrder.length > 0 ? spotlightOrder[spotIndex % spotlightOrder.length] : null;

  const passCount = showcaseItems.filter((s) => s.result.status === "Pass").length;
  const failCount = showcaseItems.filter((s) => s.result.status === "Fail").length;
  const openCount = showcaseItems.filter(
    (s) => s.result.status === "Fail" && s.result.closure_status !== "Closed",
  ).length;

  // The connecting line is drawn in real, live screen coordinates -- measured every
  // animation frame from the actual rendered positions of the hotspot dot and the
  // info panel, so it always lands exactly on both regardless of the 3D sway/parallax
  // animation constantly moving them.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const hotspotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [line, setLine] = useState<LinePoint | null>(null);

  useEffect(() => {
    let raf = 0;

    function measure() {
      const hotspotId = active?.hotspot?.id;
      const containerEl = containerRef.current;
      const panelEl = panelRef.current;
      if (!hotspotId || !containerEl || !panelEl) {
        setLine(null);
        raf = requestAnimationFrame(measure);
        return;
      }
      const hotEl = hotspotRefs.current.get(hotspotId);
      if (!hotEl) {
        setLine(null);
        raf = requestAnimationFrame(measure);
        return;
      }
      const containerRect = containerEl.getBoundingClientRect();
      const hotRect = hotEl.getBoundingClientRect();
      const panelRect = panelEl.getBoundingClientRect();
      setLine({
        x1: hotRect.left + hotRect.width / 2 - containerRect.left,
        y1: hotRect.top + hotRect.height / 2 - containerRect.top,
        x2: panelRect.left - containerRect.left,
        y2: panelRect.top + panelRect.height / 2 - containerRect.top,
      });
      raf = requestAnimationFrame(measure);
    }
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [active?.templateItemId, active?.hotspot?.id]);

  return (
    <div ref={containerRef} className="showcase-fade" style={{ position: "absolute", inset: 0, perspective: 1400 }}>
      <div className="showcase-scene" style={{ position: "absolute", inset: 0 }}>
        <div
          className="showcase-bg-pan"
          style={{
            position: "absolute",
            inset: -60,
            overflow: "hidden",
            transform: "translateZ(-160px) scale(1.16)",
          }}
        >
          {drawing ? (
            <img
              src={drawing.image_data}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "radial-gradient(circle at 30% 20%, #16202b 0%, #05070c 70%)",
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(5,7,12,0.55) 0%, rgba(5,7,12,0.15) 35%, rgba(5,7,12,0.78) 100%)",
            }}
          />
        </div>

        {drawing && (
          <div style={{ position: "absolute", inset: 0, transform: "translateZ(-30px)" }}>
            {hotspots.map((h) => {
              const linkedItems = showcaseItems.filter((s) => s.hotspot?.id === h.id);
              const worstFail = linkedItems.find((s) => s.result.status === "Fail");
              const color = worstFail
                ? (SEVERITY_GLOW[worstFail.result.severity ?? "Minor"] ?? SEVERITY_GLOW.Minor)
                : PASS_GLOW;
              const isActive = active?.hotspot?.id === h.id;
              return (
                <div
                  key={h.id}
                  ref={(el) => {
                    if (el) hotspotRefs.current.set(h.id, el);
                    else hotspotRefs.current.delete(h.id);
                  }}
                  className={isActive ? "hotspot-marker hotspot-marker-active" : "hotspot-marker"}
                  style={
                    {
                      left: `${h.x * 100}%`,
                      top: `${h.y * 100}%`,
                      color,
                    } as CSSProperties
                  }
                >
                  {isActive && <span className="hotspot-ring" />}
                  <span className="hotspot-dot" style={{ background: color }} />
                </div>
              );
            })}
          </div>
        )}

        {active && (
          <div
            ref={panelRef}
            style={{
              position: "absolute",
              right: "5%",
              top: "16%",
              width: "36%",
              maxHeight: "68%",
              transform: "translateZ(80px)",
            }}
          >
            <ShowcaseInfoPanel key={active.templateItemId} item={active} assetCode={asset.asset_code} />
          </div>
        )}

        <div style={{ position: "absolute", inset: 0, transform: "translateZ(55px)" }}>
          <ShowcaseStats
            asset={asset}
            passCount={passCount}
            failCount={failCount}
            openCount={openCount}
          />
        </div>
      </div>

      {line && (
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 3 }}
        >
          <line
            className="connector-line"
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={
              active?.result.status === "Fail"
                ? (SEVERITY_GLOW[active.result.severity ?? "Minor"] ?? SEVERITY_GLOW.Minor)
                : PASS_GLOW
            }
            strokeWidth={2}
            strokeDasharray="6 6"
          />
          <circle
            cx={line.x1}
            cy={line.y1}
            r={4}
            fill={
              active?.result.status === "Fail"
                ? (SEVERITY_GLOW[active.result.severity ?? "Minor"] ?? SEVERITY_GLOW.Minor)
                : PASS_GLOW
            }
          />
        </svg>
      )}
    </div>
  );
}

function ShowcaseField({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null;
  return (
    <div className="showcase-field">
      <div className="showcase-field-label">{label}</div>
      <div className="showcase-field-value">{value}</div>
    </div>
  );
}

function ShowcaseInfoPanel({ item, assetCode }: { item: ShowcaseItem; assetCode: string }) {
  const isFail = item.result.status === "Fail";
  const color = isFail
    ? (SEVERITY_GLOW[item.result.severity ?? "Minor"] ?? SEVERITY_GLOW.Minor)
    : PASS_GLOW;

  const reportedLine =
    item.result.reported_by || item.result.reported_at
      ? `${item.result.reported_by ?? "Unknown"}${item.result.reported_at ? ` · ${item.result.reported_at}` : ""}`
      : null;

  const commentLine = item.closingNote
    ? `${item.closingNote.action_text} — ${item.closingNote.recorded_by ?? "Unknown"}, ${item.closingNote.recorded_at}`
    : null;

  return (
    <div
      className="showcase-panel"
      style={{
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div className="showcase-panel-scroll">
        <span className="showcase-panel-badge" style={{ background: color }}>
          {isFail ? (item.result.severity ?? "Fault") : "Pass"}
        </span>
        <h3>{item.description}</h3>
        <div className="showcase-panel-meta">{assetCode}</div>

        {isFail ? (
          <>
            <ShowcaseField label="Issue / Observation" value={item.result.issue_details} />
            <ShowcaseField label="Action Taken" value={item.result.action_taken} />
            <ShowcaseField label="Status" value={item.result.closure_status} />
            <ShowcaseField label="Reported by" value={reportedLine} />
            <ShowcaseField label="Comment" value={commentLine} />
          </>
        ) : (
          <div className="showcase-panel-ok">No issues recorded — item passed inspection.</div>
        )}

        {item.attachments.length > 0 && (
          <div className="showcase-attachments">
            {item.attachments.map((a, i) => (
              <div
                key={a.id}
                className="showcase-attachment-thumb"
                style={{ animationDelay: `${i * 0.15}s` }}
                title={a.file_name}
              >
                {a.file_type.startsWith("image/") ? (
                  <img src={a.data} alt={a.file_name} />
                ) : (
                  <span className="showcase-attachment-file">
                    {a.file_name.split(".").pop()?.slice(0, 4).toUpperCase() ?? "FILE"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function useCountUp(target: number, durationMs = 800) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();

    function tick(t: number) {
      const progress = Math.min(1, (t - start) / durationMs);
      setValue(Math.round(target * progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  const animated = useCountUp(value);
  return (
    <div className="showcase-stat-pill">
      <div className="showcase-stat-value" style={color ? { color } : undefined}>
        {animated}
      </div>
      <div className="showcase-stat-label">{label}</div>
    </div>
  );
}

function ShowcaseStats({
  asset,
  passCount,
  failCount,
  openCount,
}: {
  asset: AssetMriHistorySummaryRow;
  passCount: number;
  failCount: number;
  openCount: number;
}) {
  return (
    <div className="showcase-stats">
      <div className="showcase-stats-asset">{asset.asset_code}</div>
      <StatPill label="Reports" value={asset.report_count} />
      <StatPill label="Pass" value={passCount} color={PASS_GLOW} />
      <StatPill label="Fail" value={failCount} color={SEVERITY_GLOW.Critical} />
      <StatPill label="Open" value={openCount} color={SEVERITY_GLOW.Moderate} />
    </div>
  );
}

export default IdleScreensaver;