// Test data shaped like MMS MR-I reports.
// Checklist item names: the names marked REAL appear in the MMS backend tests
// (src/desktop/src-tauri/tests/mri_matrix_backend.rs); the MMS database copy is encrypted, so
// the rest of each template's list is realistic placeholders of the same style and count.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

// PUMP UNIT: 24 items (first 9 REAL).
export const PUMP_ITEMS = [
  'Access Ladders & Handrails', 'Actuators on Control Panel', 'Agitator', 'Air Filter', 'Air Hoses',
  'Air Supply Line', 'Alternator', 'Brass Bushing Condition Within Tolerance Limits', 'Breather',
  'Coolant Level & Hoses', 'Discharge Iron & Unions', 'Drive Line & Guards', 'Engine Oil Level',
  'Fire Extinguisher', 'Fluid End Packing', 'Fuel Tank & Lines', 'Gauges & Instrumentation',
  'Hydraulic Oil Level', 'Lights & Beacons', 'Lubrication System', 'Power End Oil', 'Pressure Relief Valve',
  'Suction Manifold', 'Tyres & Wheel Nuts',
];
// COILED TUBING UNIT: 19 items (first 4 REAL).
export const CTU_ITEMS = [
  'Agitator', 'Air Hose & Coupling Connection', 'Ball Valves', 'Chain & Drive System',
  'Control Cabin', 'Coolant Level & Hoses', 'Emergency Stop', 'Engine Oil Level', 'Fire Extinguisher',
  'Gooseneck', 'Hydraulic Hoses & Fittings', 'Hydraulic Oil Level', 'Injector Head', 'Level Wind',
  'Lights & Beacons', 'Pressure Gauges', 'Reel Drive & Brake', 'Stripper', 'Tyres & Wheel Nuts',
];
export const REAL_ITEM_COUNT = { PUMP: 9, CTU: 4 };

// PUMP UNIT header fields (15): the template's real labels (test matrix case S3).
export const PUMP_HEADER_LABELS = [
  'Country', 'Service Line', 'Asset No', 'Client', 'Location', 'Compliance Stage', 'Maintenance Type',
  'Job Number', 'Pre-Mobilization Checklist ID', 'Previous Engine Hours', 'Current Engine Hours',
  'Engine Hours (This Report)', 'Job Operating Hours', 'MR II Due Date', 'MR Initization Date',
];

export const COUNTRIES = ['Oman', 'UAE', 'Saudi Arabia', 'Kuwait', 'Qatar'];
export const SERVICE_LINES = ['Pumping', 'Coiled Tubing', 'Nitrogen'];
export const PEOPLE = ['Suganya Rajendran', 'Abdulla Qais', 'Jan-Albert Victorino', 'Disantha Perera', 'Kamil Shahzad'];
export const STAGES = ['PRE-MOB', 'POST JOB', 'YARD'];
export const MAINT_TYPES = ['Preventive', 'Preventive', 'Preventive', 'Corrective', 'Breakdown'];

export const ASSETS = Array.from({ length: 10 }, (_, i) => ({
  AssetCode: `PoC-ASSET${i + 1}`,
  Country: COUNTRIES[i % COUNTRIES.length],
  ServiceLine: SERVICE_LINES[i % SERVICE_LINES.length],
  TagStatus: 'Green',
}));

export const newReportKey = (tag: string) => `PoC-${tag}-${randomUUID().slice(0, 8)}`;

export interface ReportSet {
  key: string;
  report: Record<string, unknown>;
  headers: Record<string, unknown>[];
  checklist: Record<string, unknown>[];
  faults: Record<string, unknown>[];
}

/** One full PUMP UNIT MR-I report: 1 report + 15 header values + 24 checklist results (3 Fail) + 3 fault approvals. */
export function makeReport(key: string, opts: { assetItemId?: string; country?: string; fails?: number; submitted?: Date; statusOverride?: string } = {}): ReportSet {
  const country = opts.country ?? 'Oman';
  const submitted = opts.submitted ?? new Date();
  const fails = opts.fails ?? 3;
  const sevs = ['Critical', 'Moderate', 'Minor'];
  const failIdx = new Set(Array.from({ length: fails }, (_, i) => (i * 7 + 3) % PUMP_ITEMS.length));
  const opHours = 20 + (key.charCodeAt(key.length - 1) % 40);
  const report: Record<string, unknown> = {
    Title: key,
    ReportKey: key,
    Component: 'Main Unit',
    Status: opts.statusOverride ?? 'Submitted',
    ComplianceStage: 'POST JOB',
    SubmittedBy: 'Suganya Rajendran',
    SubmittedDate: submitted.toISOString(),
    Country: country,
    ServiceLine: 'Pumping',
    MaintenanceType: 'Preventive',
    JobOperatingHours: opHours,
    RowVersionNote: JSON.stringify({ manifest: { headers: 15, checklist: 24, faults: fails } }),
  };
  if (opts.assetItemId) report.AssetLookupLookupId = opts.assetItemId;
  const headerVals: Record<string, string> = {
    Country: country, 'Service Line': 'Pumping', 'Asset No': 'PoC-ASSET2', Client: 'Test Client',
    Location: 'Test Well TW-21', 'Compliance Stage': 'POST JOB', 'Maintenance Type': 'Preventive',
    'Job Number': 'JSR-2026-0144', 'Pre-Mobilization Checklist ID': 'PMC-2026-0091',
    'Previous Engine Hours': '370', 'Current Engine Hours': '380', 'Engine Hours (This Report)': '10',
    'Job Operating Hours': String(opHours), 'MR II Due Date': '2027-01-15', 'MR Initization Date': '2026-07-15',
  };
  const headers = PUMP_HEADER_LABELS.map((l) => ({ Title: l, ReportKey: key, FieldLabel: l, Value: headerVals[l] }));
  let f = 0;
  const checklist = PUMP_ITEMS.map((name, i) => {
    const fail = failIdx.has(i);
    const sev = fail ? sevs[f++ % 3] : '';
    return {
      Title: name,
      ReportKey: key,
      ItemName: name,
      Status: fail ? 'Fail' : 'Pass',
      Severity: sev,
      IssueDetails: fail ? `${name}: wear beyond limit observed during POST JOB inspection.` : '',
      ActionTaken: fail ? 'Reported to Job Supervisor; unit tagged pending review.' : '',
      DateObserved: submitted.toISOString(),
      ClosureStatus: fail ? 'Pending' : 'N/A',
    };
  });
  const faults = checklist
    .filter((c) => c.Status === 'Fail')
    .map((c) => ({
      Title: c.ItemName,
      ReportKey: key,
      ItemName: c.ItemName,
      OriginalSeverity: c.Severity,
      Decision: 'Pending',
      Reviewer: 'Disantha Perera',
      ReviewMethod: 'In person',
      AssignedTo: 'Disantha Perera',
    }));
  return { key, report, headers, checklist, faults };
}

/** A real JPEG (assets/test_photo.jpg) made unique by inserting a JPEG comment segment after SOI. */
const BASE_JPEG = readFileSync(new URL('../../assets/test_photo.jpg', import.meta.url));
export function makePhoto(tag: string): Uint8Array {
  const comment = new TextEncoder().encode(`MMS PoC ${tag} ${randomUUID()}`);
  const seg = new Uint8Array(4 + comment.length);
  seg[0] = 0xff;
  seg[1] = 0xfe;
  const len = comment.length + 2;
  seg[2] = len >> 8;
  seg[3] = len & 0xff;
  seg.set(comment, 4);
  const out = new Uint8Array(BASE_JPEG.length + seg.length);
  out.set(BASE_JPEG.subarray(0, 2), 0);
  out.set(seg, 2);
  out.set(BASE_JPEG.subarray(2), 2 + seg.length);
  return out;
}
