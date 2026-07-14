const PURPOSES = [
  "invoice_send", "invoice_reminder", "invoice_overdue", "invoice_corrected",
  "quote_send", "quote_follow_up", "quote_accepted", "receipt_send",
  "payment_received", "payment_reminder", "document_generic"
];

const template = (purpose, subject, text) => ({
  purpose,
  subject,
  text,
  html: text.split(/\n\n/).map((paragraph) => "<p>" + paragraph.replace(/\n/g, "<br>") + "</p>").join("")
});

export const DEFAULT_EMAIL_TEMPLATES = Object.fromEntries([
  template("invoice_send", "Invoice {{document_number}} from {{business_name}}", "Hello {{customer_name}},\n\nPlease find invoice {{document_number}} from {{business_name}} attached. The total due is {{total}} by {{due_date}}.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("invoice_reminder", "Friendly reminder: invoice {{document_number}} is due {{due_date}}", "Hello {{customer_name}},\n\nA friendly reminder that invoice {{document_number}} for {{balance_due}} is due on {{due_date}}.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("invoice_overdue", "Payment overdue: invoice {{document_number}}", "Hello {{customer_name}},\n\nInvoice {{document_number}} has passed its due date. The outstanding balance is {{balance_due}}. Please arrange payment at your earliest convenience.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("invoice_corrected", "Corrected invoice {{document_number}} from {{business_name}}", "Hello {{customer_name}},\n\nPlease find the corrected version of invoice {{document_number}} attached. The current total is {{total}}.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("quote_send", "Quote {{document_number}} from {{business_name}}", "Hello {{customer_name}},\n\nPlease find quote {{document_number}} from {{business_name}} attached. The quoted total is {{total}} and it is valid until {{expiry_date}}.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("quote_follow_up", "Following up on quote {{document_number}}", "Hello {{customer_name}},\n\nI am following up on quote {{document_number}} for {{total}}. Please let us know if you have any questions or would like to proceed.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("quote_accepted", "Quote {{document_number}} accepted", "Hello {{customer_name}},\n\nThank you for accepting quote {{document_number}}. We look forward to working with you.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("receipt_send", "Receipt {{document_number}} from {{business_name}}", "Hello {{customer_name}},\n\nPlease find receipt {{document_number}} attached for {{total}} received by {{business_name}}.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("payment_received", "Payment received for invoice {{document_number}}", "Hello {{customer_name}},\n\nThank you. We have received {{amount_paid}} toward invoice {{document_number}}. The remaining balance is {{balance_due}}.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("payment_reminder", "Payment reminder for invoice {{document_number}}", "Hello {{customer_name}},\n\nInvoice {{document_number}} has an outstanding balance of {{balance_due}}. Payment details are included on the attached document.\n\n{{message}}\n\nKind regards,\n{{sender_name}}"),
  template("document_generic", "{{document_type}} {{document_number}} from {{business_name}}", "Hello {{customer_name}},\n\nPlease find {{document_type}} {{document_number}} from {{business_name}} attached.\n\n{{message}}\n\nKind regards,\n{{sender_name}}")
].map((entry) => [entry.purpose, entry]));

const allowedVariables = new Set(["document_number", "document_type", "customer_name", "business_name", "sender_name", "total", "subtotal", "amount_paid", "balance_due", "currency", "due_date", "expiry_date", "issue_date", "payment_method", "payment_link", "document_link", "message"]);
const tokenPattern = /{{\s*([a-z_]+)\s*}}/gi;

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function validateTemplate(template) {
  for (const field of ["subject", "text", "html"]) {
    const source = String(template[field] || "");
    for (const [, variable] of source.matchAll(tokenPattern)) {
      if (!allowedVariables.has(variable)) throw Object.assign(new Error(`Unknown email variable '{{${variable}}}'`), { status: 422, code: "VALIDATION_ERROR" });
    }
  }
}

export function renderTemplate(template, variables) {
  validateTemplate(template);
  const replace = (source, html) => String(source || "").replace(tokenPattern, (_, name) => html ? escapeHtml(variables[name]) : String(variables[name] ?? ""));
  return { subject: replace(template.subject, false), text: replace(template.text, false), html: replace(template.html, true) };
}

export { PURPOSES };
