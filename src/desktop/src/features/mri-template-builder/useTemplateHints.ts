// Live on-screen hints for one template, from the same queries the builder already uses.
// Display only: reads data, never writes, never changes status.

import { useMemo } from "react";
import { useTemplateHeaderFields } from "./hooks/useTemplateHeaderFields";
import { useTemplateComponents } from "./hooks/useTemplateComponents";
import { useTemplateChecklistItems } from "./hooks/useTemplateChecklistItems";
import { useTemplateDrawing, useTemplateDrawingHotspots } from "./hooks/useTemplateDrawing";
import { useTemplateMidFields } from "./hooks/useTemplateMidFields";
import { useFooterFieldCatalog, useTemplateFooterFields } from "./hooks/useTemplateFooterFields";
import { getTemplateHints } from "./templateHints";

/** Live on-screen hints for this template (display only — see templateHints.ts). */
export function useTemplateHints(templateId: number) {
  const qHeader = useTemplateHeaderFields(templateId);
  const qComponents = useTemplateComponents(templateId);
  const qItems = useTemplateChecklistItems(templateId);
  const qDrawing = useTemplateDrawing(templateId);
  const qHotspots = useTemplateDrawingHotspots(templateId);
  const qMid = useTemplateMidFields(templateId);
  const qFooter = useTemplateFooterFields(templateId);
  const qCatalog = useFooterFieldCatalog();
  const all = [qHeader, qComponents, qItems, qDrawing, qHotspots, qMid, qFooter, qCatalog];
  /** True once every query has loaded, so lists don't flash a wrong count while loading. */
  const ready = all.every((q) => q.isSuccess);
  const header = qHeader.data ?? [], components = qComponents.data ?? [], items = qItems.data ?? [];
  const drawing = qDrawing.data, hotspots = qHotspots.data ?? [], mid = qMid.data ?? [];
  const footer = qFooter.data ?? [], footerCatalog = qCatalog.data ?? [];
  const hints = useMemo(() => getTemplateHints({
    headerFields: header,
    components,
    checklistItems: items,
    hasDrawing: !!drawing,
    hotspots,
    midFieldCount: mid.length,
    footerLabels: footer.map((f) => footerCatalog.find((c) => c.id === f.footer_field_id)?.label ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [qHeader.data, qComponents.data, qItems.data, qDrawing.data, qHotspots.data, qMid.data, qFooter.data, qCatalog.data]);
  return { ...hints, ready };
}
