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
};

export const MR_ACTIONS = ["ENROLLMENT", "EDIT", "MR-I", "MR-II", "MR-III"];