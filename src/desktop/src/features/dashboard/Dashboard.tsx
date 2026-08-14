import { useState, useMemo, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, ComposedChart,
  ScatterChart, Scatter, PieChart, Pie, RadialBarChart, RadialBar,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, Cell,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Papa from "papaparse";

const C = {
  bg: "#F3F6F8", panel: "#FFFFFF", panel2: "#EEF2F5", border: "#DDE4E9",
  borderLight: "#C7D1D9", text: "#182430", sub: "#57697A", faint: "#8B9AA8",
  amber: "#C67F1E", teal: "#1B8F79", rose: "#C4485A", blue: "#3679BD",
  violet: "#7C61CC", green: "#3D9463",
};

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace';

const SERVICE_LINES = [
  { key: "wt", name: "Well Testing", color: C.teal },
  { key: "ct", name: "Coiled Tubing", color: C.amber },
  { key: "pp", name: "Pressure Pumping", color: C.blue },
  { key: "n2", name: "Nitrogen Services", color: C.violet },
  { key: "wl", name: "Wireline", color: C.rose },
];

const COUNTRIES = [
  { key: "om", name: "Oman" }, { key: "ae", name: "UAE" },
  { key: "sa", name: "Saudi Arabia" }, { key: "qa", name: "Qatar" },
];

const MONTHS = ["Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26","Jun 26","Jul 26"];

const SEVERITY = [
  { key: "Minor", level: 1, weight: 1, status: "Allowed", color: C.green },
  { key: "Moderate", level: 2, weight: 2, status: "Allowed with Monitoring", color: C.blue },
  { key: "Major", level: 3, weight: 3, status: "Conditional Operation", color: C.amber },
  { key: "Critical", level: 4, weight: 7, status: "STOP OPERATION", color: C.rose },
];

const AGING_CLASSES = [
  { bucket: "Critical > 7d", base: 2, color: C.rose },
  { bucket: "Major > 20d", base: 10, color: C.amber },
  { bucket: "Moderate > 30d", base: 15, color: C.blue },
  { bucket: "Minor > 60d", base: 35, color: C.green },
];

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDataset(seed: number) {
  const rnd = mulberry32(1000 + seed * 37);
  const jitter = (base: number, spread: number) => Math.max(0, base + (rnd() - 0.5) * spread);

  const bmerBase: Record<string, number> = { wt: 1.1, ct: 1.6, pp: 2.3, n2: 2.9, wl: 1.4 };
  const bmerTrend = MONTHS.map((m, i) => {
    const row: any = { month: m };
    let sum = 0;
    SERVICE_LINES.forEach((sl) => {
      const drift = i * 0.02 * (sl.key === "n2" ? 1 : -0.4);
      const v = Math.round(jitter(bmerBase[sl.key] + drift, 0.8) * 100) / 100;
      row[sl.key] = v;
      sum += v;
    });
    row.overall = Math.round((sum / SERVICE_LINES.length) * 100) / 100;
    return row;
  });

  const countryBMER = COUNTRIES.map((c) => ({
    name: c.name, value: Math.round(jitter(1.8, 1.4) * 100) / 100,
  }));

  const availTrend = MONTHS.map((m, i) => ({
    month: m, availability: Math.round(jitter(90 + i * 0.15, 4) * 10) / 10,
  }));

  const downtime = MONTHS.map((m) => ({
    month: m, planned: Math.round(jitter(320, 60)), unplanned: Math.round(jitter(140, 90)),
  }));

  const mr2Trend = MONTHS.map((m, i) => ({ month: m, value: Math.round(jitter(93 + i * 0.2, 6) * 10) / 10 }));
  const mr3Trend = MONTHS.map((m, i) => ({ month: m, value: Math.round(jitter(89 + i * 0.25, 7) * 10) / 10 }));

  const defectTrend = MONTHS.map((m, i) => ({
    month: m, open: Math.round(jitter(150 - i * 1.5, 30)),
  }));

  const severityDist = SEVERITY.map((s) => ({
    name: s.key, level: s.level, weight: s.weight,
    count: Math.round(jitter(({ Minor: 41, Moderate: 58, Major: 33, Critical: 14 } as any)[s.key], 10)),
    color: s.color,
  }));

  const aging = AGING_CLASSES.map((a) => ({
    bucket: a.bucket, count: Math.round(jitter(a.base, Math.max(2, a.base * 0.4))), color: a.color,
  }));

  const units: any[] = [];
  let uid = 1000;
  SERVICE_LINES.forEach((sl) => {
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const sev = SEVERITY[Math.floor(rnd() * SEVERITY.length)];
      units.push({
        id: `U-${uid++}`, serviceLine: sl.name, slKey: sl.key, color: sl.color,
        severity: sev.key, level: sev.level,
        tag: sev.key === "Critical" ? "Red Tagged" : "Green Tagged",
        tagStatus: sev.key === "Critical" ? "Not Ready for Service" : "Ready for Service",
        daysOpen: Math.round(jitter(20, 35)),
        equipment: `${sl.name.split(" ")[0]} ${100 + Math.floor(rnd() * 40)}`,
      });
    }
  });

  const riskBubble = SERVICE_LINES.map((sl) => {
    const availability = Math.round(jitter(88, 8) * 10) / 10;
    const counts = {
      Minor: Math.round(jitter(9, 6)), Moderate: Math.round(jitter(7, 5)),
      Major: Math.round(jitter(4, 3)), Critical: Math.round(jitter(1.4, 2)),
    };
    const riskScore = SEVERITY.reduce((sum, s) => sum + (counts as any)[s.key] * s.weight, 0);
    const defectCount = counts.Moderate + counts.Major + counts.Critical;
    return { name: sl.name, key: sl.key, color: sl.color, availability, riskScore, defectCount, counts };
  });

  const budget = SERVICE_LINES.map((sl) => {
    const b = Math.round(jitter(480, 180));
    const a = Math.round(jitter(b, b * 0.28));
    return {
      name: sl.name, key: sl.key, color: sl.color, budget: b, actual: a,
      variance: Math.round(((a - b) / b) * 1000) / 10,
    };
  });

  const approvals = [
    { name: "Approved", value: Math.round(jitter(58, 8)), color: C.green },
    { name: "Pending Review", value: Math.round(jitter(24, 6)), color: C.blue },
    { name: "Revision Requested", value: Math.round(jitter(12, 5)), color: C.amber },
    { name: "Rejected", value: Math.round(jitter(6, 3)), color: C.rose },
  ];

  return { bmerTrend, countryBMER, availTrend, downtime, mr2Trend, mr3Trend, defectTrend, severityDist, aging, units, riskBubble, budget, approvals };
}

function Panel({ title, subtitle, children, style }: any) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px", ...style }}>
      {title && (
        <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sub }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: C.faint, marginTop: 3 }}>{subtitle}</div>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: "8px 12px", fontFamily: MONO, fontSize: 12, boxShadow: "0 4px 14px rgba(20,30,40,0.10)" }}>
      {label && <div style={{ color: C.sub, marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || p.fill || C.text, display: "flex", gap: 10, justifyContent: "space-between" }}>
          <span>{p.name}</span>
          <strong>{typeof p.value === "number" ? p.value.toLocaleString() : p.value}{unit || ""}</strong>
        </div>
      ))}
    </div>
  );
}

function Sparkline({ data, dataKey, color }: any) {
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#spark-${dataKey})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function KPICard({ label, value, unit, delta, good, sparkData, sparkKey, color, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left", cursor: "pointer", background: active ? C.panel2 : C.panel,
        border: `1px solid ${active ? color : C.border}`, borderRadius: 10, padding: "14px 16px",
        flex: 1, minWidth: 150, transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.sub }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: C.text }}>{value}{unit}</span>
        <span style={{ fontSize: 12, fontFamily: MONO, color: good ? C.green : C.rose }}>{delta}</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <Sparkline data={sparkData} dataKey={sparkKey} color={color} />
      </div>
    </button>
  );
}

function ChipButton({ active, onClick, color, children }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: MONO, fontSize: 12, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${active ? color : C.border}`,
        background: active ? `${color}22` : "transparent",
        color: active ? color : C.sub,
        transition: "all 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: MONO, fontSize: 12.5, letterSpacing: "0.06em", textTransform: "uppercase",
        padding: "10px 16px", cursor: "pointer", background: "transparent", border: "none",
        color: active ? C.text : C.faint, borderBottom: `2px solid ${active ? C.amber : "transparent"}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Gauge({ value, target, label, size = 190 }: any) {
  const color = value >= target ? C.green : value >= target - 6 ? C.amber : C.rose;
  const data = [{ value, fill: color }];
  return (
    <div style={{ position: "relative", width: "100%", height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart cx="50%" cy="72%" innerRadius="72%" outerRadius="100%" startAngle={180} endAngle={0} data={data} barSize={16}>
          <RadialBar dataKey="value" cornerRadius={8} background={{ fill: C.panel2 }} max={100} isAnimationActive={true} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: size * 0.12, textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color }}>{value}%</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 2 }}>{label} · target {target}%</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  EXPORT HELPERS                                                        */
/* ---------------------------------------------------------------------- */

function downloadCSV(filename: string, rows: any[]) {
  if (!rows || rows.length === 0) return;
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPdf(el: HTMLElement, filename: string, setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#F3F6F8", useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [canvas.width / 2, canvas.height / 2] });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
    pdf.save(filename);
  } finally {
    setBusy(false);
  }
}

/* ---------------------------------------------------------------------- */
/*  MAIN                                                                   */
/* ---------------------------------------------------------------------- */

function Dashboard() {
  const [tab, setTab] = useState("reliability");
  const [selectedLines, setSelectedLines] = useState(SERVICE_LINES.map((s) => s.key));
  const [range, setRange] = useState(6);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [seed, setSeed] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => buildDataset(seed), [seed]);

  const toggleLine = (key: string) => {
    setSelectedLines((prev) => (prev.includes(key) ? (prev.length > 1 ? prev.filter((k) => k !== key) : prev) : [...prev, key]));
  };

  const slice = (arr: any[]) => arr.slice(arr.length - range);

  const bmerSlice = slice(data.bmerTrend);
  const availSlice = slice(data.availTrend);
  const downtimeSlice = slice(data.downtime);
  const mr2Slice = slice(data.mr2Trend);
  const mr3Slice = slice(data.mr3Trend);
  const defectSlice = slice(data.defectTrend);

  const latestBMER: any = bmerSlice[bmerSlice.length - 1];
  const prevBMER: any = bmerSlice[bmerSlice.length - 2] || latestBMER;
  const latestAvail: any = availSlice[availSlice.length - 1];
  const prevAvail: any = availSlice[availSlice.length - 2] || latestAvail;
  const latestMR2: any = mr2Slice[mr2Slice.length - 1];
  const prevMR2: any = mr2Slice[mr2Slice.length - 2] || latestMR2;
  const latestMR3: any = mr3Slice[mr3Slice.length - 1];
  const prevMR3: any = mr3Slice[mr3Slice.length - 2] || latestMR3;
  const latestDefects: any = defectSlice[defectSlice.length - 1];
  const prevDefects: any = defectSlice[defectSlice.length - 2] || latestDefects;

  const filteredUnits = data.units.filter((u: any) => (severityFilter ? u.severity === severityFilter : true));

  const doRefresh = () => {
    setRefreshing(true);
    setTimeout(() => { setSeed((s) => s + 1); setRefreshing(false); }, 550);
  };

  const fmtDelta = (curr: number, prev: number, higherIsBetter: boolean) => {
    const d = Math.round((curr - prev) * 100) / 100;
    const good = higherIsBetter ? d >= 0 : d <= 0;
    const sign = d > 0 ? "+" : "";
    return { text: `${sign}${d}`, good };
  };

  const kpis = [
    { key: "bmer", label: "Fleet BMER", value: latestBMER.overall, unit: "%", ...fmtDelta(latestBMER.overall, prevBMER.overall, false), color: C.amber, sparkData: bmerSlice, sparkKey: "overall" },
    { key: "avail", label: "Availability", value: latestAvail.availability, unit: "%", ...fmtDelta(latestAvail.availability, prevAvail.availability, true), color: C.teal, sparkData: availSlice, sparkKey: "availability" },
    { key: "mr2", label: "MR2 Compliance", value: latestMR2.value, unit: "%", ...fmtDelta(latestMR2.value, prevMR2.value, true), color: C.blue, sparkData: mr2Slice, sparkKey: "value" },
    { key: "mr3", label: "MR3 Compliance", value: latestMR3.value, unit: "%", ...fmtDelta(latestMR3.value, prevMR3.value, true), color: C.violet, sparkData: mr3Slice, sparkKey: "value" },
    { key: "defects", label: "Open Defects", value: latestDefects.open, unit: "", ...fmtDelta(latestDefects.open, prevDefects.open, false), color: C.rose, sparkData: defectSlice, sparkKey: "open" },
  ];

  const tabToKpi: any = { reliability: "bmer", compliance: "mr2", defects: "defects", risk: "avail", planning: null };

  const tabExportRows: Record<string, () => any[]> = {
    reliability: () => bmerSlice,
    defects: () => data.severityDist,
    risk: () => data.riskBubble,
    planning: () => data.budget,
    compliance: () => [...mr2Slice.map((r: any) => ({ month: r.month, mr2: r.value })), ...mr3Slice.map((r: any) => ({ month: r.month, mr3: r.value }))],
  };

  return (
    <div style={{ background: C.bg, minHeight: "100%", fontFamily: SANS, color: C.text, padding: "22px 24px 60px" }} ref={captureRef}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint }}>MMS · Fleet Overview</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>Maintenance Dashboard</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={doRefresh}
            style={{
              fontFamily: MONO, fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${C.border}`, background: C.panel, color: C.sub,
              animation: refreshing ? "mms-pulse 0.5s ease-in-out infinite" : "none",
            }}
          >
            {refreshing ? "Refreshing…" : "↻ Refresh data"}
          </button>
          <button
            onClick={() => downloadCSV(`mms-${tab}-data.csv`, tabExportRows[tab]())}
            style={{ fontFamily: MONO, fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.border}`, background: C.panel, color: C.sub }}
          >
            ⤓ Export CSV
          </button>
          <button
            onClick={() => captureRef.current && exportPdf(captureRef.current, `mms-dashboard-${tab}.pdf`, setExportingPdf)}
            disabled={exportingPdf}
            style={{ fontFamily: MONO, fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: exportingPdf ? "wait" : "pointer", border: `1px solid ${C.blue}`, background: exportingPdf ? C.panel2 : C.blue, color: exportingPdf ? C.blue : "#fff" }}
          >
            {exportingPdf ? "Generating…" : "⤓ Export PDF"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {kpis.map((k) => (
          <KPICard key={k.key} {...k} active={tabToKpi[tab] === k.key} onClick={() => {
            const target = Object.keys(tabToKpi).find((t) => tabToKpi[t] === k.key);
            if (target) setTab(target);
          }} />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 4, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex" }}>
          <TabButton active={tab === "reliability"} onClick={() => setTab("reliability")}>Reliability</TabButton>
          <TabButton active={tab === "defects"} onClick={() => setTab("defects")}>Defects</TabButton>
          <TabButton active={tab === "risk"} onClick={() => setTab("risk")}>Risk</TabButton>
          <TabButton active={tab === "planning"} onClick={() => setTab("planning")}>Planning</TabButton>
          <TabButton active={tab === "compliance"} onClick={() => setTab("compliance")}>Compliance</TabButton>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", paddingBottom: 8 }}>
          {SERVICE_LINES.map((s) => (
            <ChipButton key={s.key} active={selectedLines.includes(s.key)} color={s.color} onClick={() => toggleLine(s.key)}>
              {s.name}
            </ChipButton>
          ))}
          {[3, 6, 12].map((r) => (
            <ChipButton key={r} active={range === r} color={C.blue} onClick={() => setRange(r)}>
              {r}mo
            </ChipButton>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === "reliability" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
            <Panel title="Broken Maintenance Event Rate (BMER)" subtitle="Monthly trend by service line" style={{ gridColumn: "1 / -1" }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={bmerSlice} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <YAxis stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 11.5 }} />
                  {SERVICE_LINES.filter((s) => selectedLines.includes(s.key)).map((s) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} />
                  ))}
                  <Line type="monotone" dataKey="overall" name="Fleet Overall" stroke={C.text} strokeWidth={2.5} strokeDasharray="5 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="BMER by Country" subtitle="Latest month comparison">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.countryBMER} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 10.5 }} />
                  <YAxis stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="BMER" fill={C.blue} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Equipment Availability" subtitle="Monthly trend, gauge shows latest">
              <Gauge value={latestAvail.availability} target={92} label="Availability" size={150} />
            </Panel>

            <Panel title="Maintenance Downtime" subtitle="Planned vs. unplanned hours" style={{ gridColumn: "1 / -1" }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={downtimeSlice} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <YAxis stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} unit="h" />
                  <Tooltip content={<CustomTooltip unit="h" />} />
                  <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 11.5 }} />
                  <Bar dataKey="planned" name="Planned" stackId="dt" fill={C.blue} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="unplanned" name="Unplanned" stackId="dt" fill={C.rose} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        )}

        {tab === "compliance" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Panel title="MR2 Compliance">
              <Gauge value={latestMR2.value} target={95} label="MR2 compliance" />
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={mr2Slice} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 10.5 }} />
                  <YAxis stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 10.5 }} domain={[75, 100]} />
                  <Tooltip content={<CustomTooltip unit="%" />} />
                  <ReferenceLine y={95} stroke={C.faint} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="value" name="MR2" stroke={C.blue} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="MR3 Compliance">
              <Gauge value={latestMR3.value} target={95} label="MR3 compliance" />
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={mr3Slice} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 10.5 }} />
                  <YAxis stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 10.5 }} domain={[75, 100]} />
                  <Tooltip content={<CustomTooltip unit="%" />} />
                  <ReferenceLine y={95} stroke={C.faint} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="value" name="MR3" stroke={C.violet} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        )}

        {tab === "defects" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Panel title="Open Defect Count" subtitle="Monthly trend" style={{ gridColumn: "1 / -1" }}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={defectSlice} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="defect-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.rose} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.rose} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <YAxis stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="open" name="Open defects" stroke={C.rose} strokeWidth={2} fill="url(#defect-fill)" />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Severity Distribution" subtitle="MMSM Table 3 levels (1–4) · click a bar to drill into affected units">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.severityDist} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <YAxis stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Defects" radius={[6, 6, 0, 0]} cursor="pointer"
                    onClick={(d: any) => setSeverityFilter((prev) => (prev === d.name ? null : d.name))}>
                    {data.severityDist.map((d, i) => (
                      <Cell key={i} fill={d.color} opacity={severityFilter && severityFilter !== d.name ? 0.35 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Defect Aging" subtitle="Count of open defects past severity-specific threshold" style={{ gridColumn: "1 / -1" }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.aging} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucket" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <YAxis stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Defects" radius={[6, 6, 0, 0]}>
                    {data.aging.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel
              title={`Affected Units${severityFilter ? ` · ${severityFilter}` : ""}`}
              subtitle={severityFilter ? "Click the severity bar again to clear the filter" : "All open severities shown"}
              style={{ gridColumn: "1 / -1" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr 1fr 0.8fr 1.3fr", gap: 8, fontFamily: MONO, fontSize: 12 }}>
                <div style={{ color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10.5 }}>Unit</div>
                <div style={{ color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10.5 }}>Service line</div>
                <div style={{ color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10.5 }}>Severity</div>
                <div style={{ color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10.5 }}>Days open</div>
                <div style={{ color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10.5 }}>Status</div>
                {filteredUnits.slice(0, 16).map((u: any) => (
                  <div key={u.id} style={{ display: "contents" }}>
                    <div style={{ color: C.text }}>{u.equipment}</div>
                    <div style={{ color: u.color }}>{u.serviceLine}</div>
                    <div style={{ color: SEVERITY.find((s) => s.key === u.severity)?.color }}>Lvl {u.level} · {u.severity}</div>
                    <div style={{ color: u.daysOpen > 30 ? C.rose : C.text }}>{u.daysOpen}d</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: u.tag === "Red Tagged" ? C.rose : C.green, display: "inline-block" }} />
                      <span style={{ color: u.tag === "Red Tagged" ? C.rose : C.green }}>{u.tag}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {tab === "risk" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
            <Panel title="Availability vs Risk" subtitle="Bubble size = outstanding moderate/major/critical defects">
              <ResponsiveContainer width="100%" height={340}>
                <ScatterChart margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="availability" name="Availability" unit="%" domain={[75, 100]} stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <YAxis type="number" dataKey="riskScore" name="Risk score" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} />
                  <ZAxis type="number" dataKey="defectCount" range={[200, 1800]} name="Open defects" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<CustomTooltip />} />
                  <ReferenceLine x={92} stroke={C.faint} strokeDasharray="4 4" />
                  <Scatter data={data.riskBubble.filter((r) => selectedLines.includes(r.key))} fillOpacity={0.75}>
                    {data.riskBubble.filter((r) => selectedLines.includes(r.key)).map((d, i) => (
                      <Cell key={i} fill={d.color} stroke={d.riskScore > 55 ? C.rose : d.color} strokeWidth={d.riskScore > 55 ? 2 : 0} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Risk Ranking" subtitle="Service lines sorted by fleet risk score">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[...data.riskBubble].sort((a, b) => b.riskScore - a.riskScore).map((r) => (
                  <div key={r.key} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", borderRadius: 8, background: C.panel2,
                    border: `1px solid ${r.riskScore > 55 ? C.rose : C.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: r.color, display: "inline-block" }} />
                      <span style={{ fontSize: 13 }}>{r.name}</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.sub, display: "flex", gap: 12 }}>
                      <span>avail {r.availability}%</span>
                      <span style={{ color: r.riskScore > 55 ? C.rose : C.text }}>risk {r.riskScore}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {tab === "planning" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
            <Panel title="MR3 Budget vs Actual" subtitle="By service line, with cost variance %">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data.budget.filter((b) => selectedLines.includes(b.key))} margin={{ top: 10, right: 30, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 10.5 }} />
                  <YAxis yAxisId="left" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} unit="k" />
                  <YAxis yAxisId="right" orientation="right" stroke={C.faint} tick={{ fontFamily: MONO, fontSize: 11 }} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 11.5 }} />
                  <Bar yAxisId="left" dataKey="budget" name="Budget ($k)" fill={C.blue} radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="actual" name="Actual ($k)" fill={C.amber} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="variance" name="Variance %" stroke={C.rose} strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Planner Approval Status" subtitle="Current MR3 planning cycle">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={data.approvals} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                    {data.approvals.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 11.5 }} layout="vertical" verticalAlign="middle" align="right" />
                </PieChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        )}
      </div>

      <div style={{ marginTop: 26, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>
        Dashboard built on MMSM SPC-MTN-OMN-01/v2 (Rev. 02) and the MMS Dashboard Visualization matrix. Defect severity levels/weights and aging classification
        follow the manual's Table 3; equipment status tags follow §8.1. All values shown are illustrative sample data, not production figures.
      </div>

      <style>{`
        @keyframes mms-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

export default Dashboard;