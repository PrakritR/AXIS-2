export type DocumentTemplateMergeField = {
  key: string;
  label: string;
  required?: boolean;
};

export type ManagerDocumentTemplate = {
  id: string;
  name: string;
  category: string;
  bodyHtml: string;
  mergeFields: DocumentTemplateMergeField[];
};

export function applyMergeFields(html: string, values: Record<string, string>): string {
  let out = html;
  for (const [key, value] of Object.entries(values)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

export function mapTemplateRow(row: Record<string, unknown>): ManagerDocumentTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    bodyHtml: String(row.body_html ?? ""),
    mergeFields: Array.isArray(row.merge_fields) ? (row.merge_fields as DocumentTemplateMergeField[]) : [],
  };
}
