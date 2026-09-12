import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface TemplateDrawing {
  id: number;
  template_id: number;
  image_data: string;
  updated_date: string;
}

export interface Hotspot {
  id: number;
  template_id: number;
  x: number;
  y: number;
  label: string | null;
  display_order: number;
  checklist_item_ids: number[];
}

export function useTemplateDrawing(templateId: number) {
  return useQuery({
    queryKey: ["template-drawing", templateId],
    queryFn: () => invoke<TemplateDrawing | null>("get_template_drawing", { templateId }),
  });
}

export function useSetTemplateDrawing(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (imageData: string) => invoke<string>("set_template_drawing", { templateId, imageData }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-drawing", templateId] }),
  });
}

export function useDeleteTemplateDrawing(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<string>("delete_template_drawing", { templateId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template-drawing", templateId] });
      qc.invalidateQueries({ queryKey: ["template-drawing-hotspots", templateId] });
    },
  });
}

export function useTemplateDrawingHotspots(templateId: number) {
  return useQuery({
    queryKey: ["template-drawing-hotspots", templateId],
    queryFn: () => invoke<Hotspot[]>("get_template_drawing_hotspots", { templateId }),
  });
}

export function useCreateHotspot(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hotspot: { x: number; y: number; label: string | null; displayOrder: number }) =>
      invoke<number>("create_hotspot", {
        hotspot: {
          template_id: templateId,
          x: hotspot.x,
          y: hotspot.y,
          label: hotspot.label,
          display_order: hotspot.displayOrder,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-drawing-hotspots", templateId] }),
  });
}

export function useUpdateHotspot(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; x: number; y: number; label: string | null }) =>
      invoke<string>("update_hotspot", vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-drawing-hotspots", templateId] }),
  });
}

export function useDeleteHotspot(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke<string>("delete_hotspot", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-drawing-hotspots", templateId] }),
  });
}

export function useSetHotspotChecklistItems(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { hotspotId: number; checklistItemIds: number[] }) =>
      invoke<string>("set_hotspot_checklist_items", vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-drawing-hotspots", templateId] }),
  });
}