export interface Asset {
  id: number | null;
  asset_code: string;
  asset_description: string;
  country: string;
  service_line: string;
  active: boolean;
  service_asset: boolean;
  vehicle: boolean;
  mr_last_action: string;
  last_action_by: string;
  last_action_dt: string;
  asset_type_id: number | null;
  client: string;
  // Read-only — set entirely by the MR-I fault approval/rectification workflow, never
  // editable from the Asset Registry form. null = not yet tagged by any fault outcome.
  tag_status: "Red" | "Yellow" | "Green" | null;
  // Why the unit carries its current tag (Manual 8.1). Read-only, set by the workflow.
  tag_reason: string | null;
}

// Approved Red-tag exemption granted through MOC (Manual 6.1.5).
export interface MocExemption {
  id: number;
  asset_id: number;
  moc_reference: string;
  approved_by: string;
  limitations: string;
  required_controls: string;
  valid_from: string;
  valid_until: string;
  return_conditions: string;
  status: "Active" | "Revoked" | "Closed";
  created_by: string | null;
  created_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  is_valid: boolean;
}

export interface MocExemptionInput {
  asset_id: number;
  moc_reference: string;
  approved_by: string;
  limitations: string;
  required_controls: string;
  valid_from: string;
  valid_until: string;
  return_conditions: string;
}

// One row of an asset's tag history: every Red/Green change with who, when, why.
export interface AssetTagHistoryEntry {
  id: number;
  asset_id: number;
  tag_status: string;
  previous_tag_status: string | null;
  reason: string | null;
  report_id: number | null;
  changed_by: string | null;
  changed_at: string;
}

export const emptyAsset: Asset = {
  id: null,
  asset_code: "",
  asset_description: "",
  country: "",
  service_line: "",
  active: true,
  service_asset: true,
  vehicle: false,
  mr_last_action: "ENROLLMENT",
  last_action_by: "",
  last_action_dt: "",
  asset_type_id: null,
  client: "",
  tag_status: null,
  tag_reason: null,
};

export const MR_ACTIONS = ["ENROLLMENT", "EDIT", "MR-I", "MR-II", "MR-III"];