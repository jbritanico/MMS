// SharePoint structure for the PoC. Mirrors the MMS local tables (src/desktop/src-tauri/src/lib.rs).
// Column internal names are the MMS field names in PascalCase (e.g. asset_code -> AssetCode).
// Every list/library name carries the PoC_ prefix; the code refuses to write to anything else.

export type ColType = 'text' | 'note' | 'dateTime' | 'number' | 'lookup';

export interface ColDef {
  name: string;
  type: ColType;
  indexed?: boolean;
  /** For lookup columns: logical name of the target list (resolved to its id at setup). */
  lookupList?: string;
  /** MMS source column, for the report. */
  mms?: string;
}

export interface ListDef {
  name: string; // without the PoC_ prefix
  template: 'genericList' | 'documentLibrary';
  mmsTable: string;
  columns: ColDef[];
}

export const PREFIX = 'PoC_';
export const pocName = (n: string) => PREFIX + n;

export const LISTS: ListDef[] = [
  {
    name: 'Assets',
    template: 'genericList',
    mmsTable: 'assets',
    columns: [
      { name: 'AssetCode', type: 'text', indexed: true, mms: 'asset_code' },
      { name: 'Country', type: 'text', mms: 'country' },
      { name: 'ServiceLine', type: 'text', mms: 'service_line' },
      { name: 'TagStatus', type: 'text', mms: 'tag_status' },
    ],
  },
  {
    name: 'MriReports',
    template: 'genericList',
    mmsTable: 'mri_reports',
    columns: [
      { name: 'ReportKey', type: 'text', indexed: true, mms: '(new: global key; replaces local id)' },
      { name: 'AssetLookup', type: 'lookup', lookupList: 'Assets', mms: 'asset_id' },
      { name: 'Component', type: 'text', mms: 'component_id' },
      { name: 'Status', type: 'text', indexed: true, mms: 'status' },
      { name: 'ComplianceStage', type: 'text', mms: 'header value "Compliance Stage"' },
      { name: 'SubmittedBy', type: 'text', mms: 'submitted_by' },
      { name: 'SubmittedDate', type: 'dateTime', indexed: true, mms: 'submitted_date' },
      { name: 'Country', type: 'text', indexed: true, mms: 'assets.country (denormalised)' },
      { name: 'RowVersionNote', type: 'note', mms: '(PoC: save manifest / version note)' },
      // Added for S7 (dashboard inputs); denormalised from header values / assets.
      { name: 'ServiceLine', type: 'text', mms: 'assets.service_line (denormalised, S7)' },
      { name: 'MaintenanceType', type: 'text', mms: 'header value "Maintenance Type" (denormalised, S7)' },
      { name: 'JobOperatingHours', type: 'number', mms: 'header value "Job Operating Hours" (denormalised, S7)' },
    ],
  },
  {
    name: 'ReportHeaderValues',
    template: 'genericList',
    mmsTable: 'mri_report_header_values',
    columns: [
      { name: 'ReportKey', type: 'text', indexed: true, mms: 'report_id' },
      { name: 'FieldLabel', type: 'text', mms: 'template_header_field_id -> label' },
      { name: 'Value', type: 'note', mms: 'value' },
    ],
  },
  {
    name: 'ChecklistResults',
    template: 'genericList',
    mmsTable: 'mri_report_checklist_results',
    columns: [
      { name: 'ReportKey', type: 'text', indexed: true, mms: 'report_id' },
      { name: 'ItemName', type: 'text', mms: 'template_checklist_item_id -> description' },
      { name: 'Status', type: 'text', indexed: true, mms: 'status' },
      { name: 'Severity', type: 'text', indexed: true, mms: 'severity' },
      { name: 'IssueDetails', type: 'note', mms: 'issue_details' },
      { name: 'ActionTaken', type: 'note', mms: 'action_taken' },
      { name: 'DateObserved', type: 'dateTime', mms: 'date_observed' },
      { name: 'ClosureStatus', type: 'text', indexed: true, mms: 'closure_status' },
      { name: 'PhotoRefs', type: 'note', mms: 'mri_report_attachments (link to PoC_ReportPhotos, S6)' },
    ],
  },
  {
    name: 'FaultApprovals',
    template: 'genericList',
    mmsTable: 'mri_fault_approvals',
    columns: [
      { name: 'ReportKey', type: 'text', indexed: true, mms: 'report_id' },
      { name: 'ItemName', type: 'text', mms: 'template_checklist_item_id -> description' },
      { name: 'OriginalSeverity', type: 'text', mms: 'original_severity' },
      { name: 'Decision', type: 'text', indexed: true, mms: 'decision' },
      { name: 'Reviewer', type: 'text', mms: 'reviewer' },
      { name: 'ReviewMethod', type: 'text', mms: 'review_method' },
      { name: 'AssignedTo', type: 'text', mms: 'assigned_to_user_id' },
    ],
  },
  {
    name: 'DecisionLog',
    template: 'genericList',
    mmsTable: 'mri_fault_decision_log',
    columns: [
      { name: 'ReportKey', type: 'text', indexed: true, mms: 'report_id' },
      { name: 'ItemName', type: 'text', mms: 'fault_approval_id -> item' },
      { name: 'Action', type: 'text', mms: 'action' },
      { name: 'FromSeverity', type: 'text', mms: 'from_severity' },
      { name: 'ToSeverity', type: 'text', mms: 'to_severity' },
      { name: 'Reviewer', type: 'text', mms: 'reviewer' },
      { name: 'ReviewMethod', type: 'text', mms: 'review_method' },
      { name: 'Notes', type: 'note', mms: 'notes' },
      { name: 'RecordedBy', type: 'text', mms: 'recorded_by' },
      { name: 'LoggedAt', type: 'dateTime', mms: 'logged_at' },
    ],
  },
  {
    name: 'Rectifications',
    template: 'genericList',
    mmsTable: 'mri_fault_rectifications',
    columns: [
      { name: 'ReportKey', type: 'text', indexed: true, mms: 'fault_approval_id -> report_id' },
      { name: 'ItemName', type: 'text', mms: 'fault_approval_id -> item' },
      { name: 'AssignedTechnician', type: 'text', mms: 'assigned_technician' },
      { name: 'PartsStatus', type: 'text', mms: 'parts_status' },
      { name: 'RepairDate', type: 'dateTime', mms: 'repair_date' },
      { name: 'VerifiedBy', type: 'text', mms: 'verified_by' },
      { name: 'TagStatus', type: 'text', indexed: true, mms: 'tag_status' },
    ],
  },
  {
    name: 'TagHistory',
    template: 'genericList',
    mmsTable: 'asset_tag_history',
    columns: [
      { name: 'AssetCode', type: 'text', indexed: true, mms: 'asset_id -> asset_code' },
      { name: 'TagStatus', type: 'text', mms: 'tag_status' },
      { name: 'PreviousTagStatus', type: 'text', mms: 'previous_tag_status' },
      { name: 'Reason', type: 'note', mms: 'reason' },
      { name: 'ReportKey', type: 'text', mms: 'report_id' },
      { name: 'ChangedBy', type: 'text', mms: 'changed_by' },
      { name: 'ChangedAt', type: 'dateTime', mms: 'changed_at' },
    ],
  },
  {
    name: 'ReportPhotos',
    template: 'documentLibrary',
    mmsTable: 'mri_report_attachments',
    columns: [
      { name: 'ReportKey', type: 'text', indexed: true, mms: 'report_id' },
      { name: 'ItemName', type: 'text', mms: 'checklist item' },
    ],
  },
];

export function columnBody(c: ColDef, lookupListId?: string): Record<string, unknown> {
  const base: Record<string, unknown> = { name: c.name, displayName: c.name, indexed: !!c.indexed };
  switch (c.type) {
    case 'text':
      return { ...base, text: { maxLength: 255 } };
    case 'note':
      return { ...base, text: { allowMultipleLines: true, linesForEditing: 6, textType: 'plain' } };
    case 'dateTime':
      return { ...base, dateTime: { format: 'dateTime' } };
    case 'number':
      return { ...base, number: {} };
    case 'lookup':
      if (!lookupListId) throw new Error(`lookup ${c.name}: target list id missing`);
      return { ...base, lookup: { listId: lookupListId, columnName: 'Title' } };
  }
}
