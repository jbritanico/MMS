// Gathers what the on-screen hints need for one MR-I report, from the same cached queries the wizard
// steps already use, and runs the display-only rules in reportHints.ts. Reads only — nothing is saved.

import { useMemo } from "react";
import { useTemplateHeaderFields, useHeaderFieldCatalog } from "../mri-template-builder/hooks/useTemplateHeaderFields";
import { useTemplateMidFields, useMidFieldCatalog } from "../mri-template-builder/hooks/useTemplateMidFields";
import { useTemplateFooterFields, useFooterFieldCatalog } from "../mri-template-builder/hooks/useTemplateFooterFields";
import { useTemplateChecklistItems } from "../mri-template-builder/hooks/useTemplateChecklistItems";
import { useChecklistItems } from "../administration/hooks/useChecklistDataBank";
import {
  useMriReportHeaderValues,
  useMriReportChecklistResults,
  useMriReportMidValues,
  useMriReportFooterValues,
} from "./hooks/useMriReportValues";
import { usePreviousComplianceStage } from "./hooks/useMriReports";
import { getReportHints, type ReportHints } from "./reportHints";

const DISTANCE_PRE_JOB = "distance travelled pre-job (km)";
const DISTANCE_POST_JOB = "distance travelled post-job (km)";

export function useReportHints(report: { id: number; template_id: number; asset_id: number } | undefined): ReportHints {
  const templateId = report?.template_id ?? 0;
  const reportId = report?.id ?? 0;
  const { data: headerFields = [] } = useTemplateHeaderFields(templateId);
  const { data: headerCatalog = [] } = useHeaderFieldCatalog();
  const { data: headerValues = [] } = useMriReportHeaderValues(reportId);
  const { data: templateItems = [] } = useTemplateChecklistItems(templateId);
  const { data: databank = [] } = useChecklistItems();
  const { data: results = [] } = useMriReportChecklistResults(reportId);
  const { data: midFields = [] } = useTemplateMidFields(templateId);
  const { data: midCatalog = [] } = useMidFieldCatalog();
  const { data: midValues = [] } = useMriReportMidValues(reportId);
  const { data: footerFields = [] } = useTemplateFooterFields(templateId);
  const { data: footerCatalog = [] } = useFooterFieldCatalog();
  const { data: footerValues = [] } = useMriReportFooterValues(reportId);
  const { data: previousStage } = usePreviousComplianceStage(report?.asset_id ?? 0, reportId);

  return useMemo(() => {
    const header = headerFields.map((tf) => ({
      label: headerCatalog.find((c) => c.id === tf.header_field_id)?.label ?? "—",
      required: tf.required,
      value: headerValues.find((v) => v.template_header_field_id === tf.id)?.value ?? "",
    }));
    const checklist = templateItems.map((ti) => {
      const r = results.find((x) => x.template_checklist_item_id === ti.id);
      return {
        name: databank.find((d) => d.id === ti.checklist_item_id)?.description ?? `Item #${ti.id}`,
        required: ti.required,
        status: (r?.status === "Pass" || r?.status === "Fail" ? r.status : null) as "Pass" | "Fail" | null,
        issueDetails: r?.issue_details ?? "",
        actionTaken: r?.action_taken ?? "",
        severity: r?.severity ?? null,
        closure: r?.closure_status ?? null,
      };
    });
    const stage = header.find((f) => f.label.trim().toLowerCase() === "compliance stage")?.value ?? "";
    const wanted = stage.trim().toUpperCase() === "PRE-JOB" ? DISTANCE_PRE_JOB : DISTANCE_POST_JOB;
    const mid = midFields.map((tf) => ({
      label: (midCatalog.find((c) => c.id === tf.mid_field_id)?.label ?? "").trim().toLowerCase(),
      value: midValues.find((v) => v.template_mid_field_id === tf.id)?.value ?? "",
    }));
    const footer = footerFields.map((tf) => ({
      label: footerCatalog.find((c) => c.id === tf.footer_field_id)?.label ?? "—",
      value: footerValues.find((v) => v.template_footer_field_id === tf.id)?.value ?? "",
    }));
    return getReportHints({
      header,
      checklist,
      distance: mid.length ? { stage, previousStage: previousStage ?? null, km: mid.find((m) => m.label === wanted)?.value ?? "" } : null,
      footer,
    });
  }, [headerFields, headerCatalog, headerValues, templateItems, databank, results, midFields, midCatalog, midValues, footerFields, footerCatalog, footerValues, previousStage]);
}
