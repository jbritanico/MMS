import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface Trigger {
    id: number;
    asset_id: number;
    mr_level: string;
    trigger_type: string;
    enabled: boolean;
    interval_value: number;
    warning_value: number;
    running_value: number;
    tally_value: number;
}

export function useAssetTriggers(assetId: number | null) {
    return useQuery({
        queryKey: ["triggers", assetId],
        queryFn: () => invoke<Trigger[]>("get_asset_triggers", { assetId }),
        enabled: assetId !== null,
    });
}

export interface TriggerUpdate {
    id: number;
    enabled: boolean;
    interval_value: number;
    warning_value: number;
    running_value: number;
}

export function useUpdateTrigger(assetId: number | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (update: TriggerUpdate) => invoke("update_trigger", update),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["triggers", assetId] }),
    });
}