export const TEMPLATE_IDS = ["classic", "minimal", "bold", "executive", "compact"];

export const TEMPLATE_DEFINITIONS = {
  classic: { id: "classic", name: "Classic", accent: "#7f56d9", font: "Helvetica", density: "comfortable" },
  minimal: { id: "minimal", name: "Minimal", accent: "#155eef", font: "Helvetica", density: "airy" },
  bold: { id: "bold", name: "Bold", accent: "#d92d20", font: "Helvetica-Bold", density: "comfortable" },
  executive: { id: "executive", name: "Executive", accent: "#027a48", font: "Helvetica", density: "comfortable" },
  compact: { id: "compact", name: "Compact", accent: "#344054", font: "Helvetica", density: "compact" }
};

export function templateFor(templateId = "classic") {
  const template = TEMPLATE_DEFINITIONS[templateId];
  if (!template) {
    throw Object.assign(new Error(`Unknown template_id '${templateId}'`), { status: 422, code: "VALIDATION_ERROR" });
  }
  return template;
}

export function listTemplates() {
  return TEMPLATE_IDS.map((id) => ({ ...TEMPLATE_DEFINITIONS[id] }));
}
