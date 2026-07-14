const MAX_INPUT_LENGTH = 4000;
const currencySymbols = { R: "ZAR", $: "USD", "€": "EUR", "£": "GBP" };
const currencyPattern = "ZAR|USD|EUR|GBP";
const symbolPattern = "R$€£";

function validation(message) {
  return Object.assign(new Error(message), { status: 422, code: "VALIDATION_ERROR" });
}

function amountToMinor(value) {
  const normalized = String(value).replace(/\s/g, "");
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimals = ""] = normalized.replace(/,/g, "").split(".");
  return Number(whole) * 100 + Number((decimals + "00").slice(0, 2));
}

function currencyFrom(segment, fallback) {
  const match = segment.match(new RegExp(`(?:\\b(${currencyPattern})\\b|([${symbolPattern}]))\\s*(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?`, "i"));
  if (!match) return { currency: String(fallback).toUpperCase(), defaulted: true };
  return { currency: (match[1] || currencySymbols[match[2]]).toUpperCase(), defaulted: false };
}

function parseItem(segment, currency) {
  const text = segment.trim().replace(/[!?]+$/, "");
  if ((text.match(/(?:@|\bat\b)/gi) || []).length !== 1) return null;
  const price = text.match(new RegExp(`\\s*(?:@|at)\\s*(?:(${currencyPattern})\\s*|([${symbolPattern}])\\s*)?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)\\s*(?:each|per\\s+[A-Za-z]+)?\\s*\\.?$`, "i"));
  if (!price) return null;

  let description = text.slice(0, price.index).trim();
  let quantity = 1;
  const leadingQuantity = description.match(/^(\d+(?:\.\d+)?)\s*(?:x|×)\s+(.+)$/i);
  const timeQuantity = description.match(/^(\d+(?:\.\d+)?)\s+(?:hours?|hrs?|days?|weeks?|months?)\s+(.+)$/i);
  const trailingQuantity = description.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:x|×)$/i);
  if (leadingQuantity) {
    quantity = Number(leadingQuantity[1]);
    description = leadingQuantity[2].trim();
  } else if (timeQuantity) {
    quantity = Number(timeQuantity[1]);
    description = timeQuantity[2].trim();
  } else if (trailingQuantity) {
    quantity = Number(trailingQuantity[2]);
    description = trailingQuantity[1].trim();
  }

  const unitPriceMinor = amountToMinor(price[3]);
  if (!description || !Number.isFinite(quantity) || quantity <= 0 || unitPriceMinor === null) return null;
  return { description, quantity, unit_price_minor: unitPriceMinor, currency };
}

function parseItemList(segment, currency) {
  const direct = parseItem(segment, currency);
  if (direct) return [direct];

  const separator = /\s+(?:and|&)\s+|,\s+/gi;
  let match;
  while ((match = separator.exec(segment))) {
    const left = parseItem(segment.slice(0, match.index), currency);
    if (!left) continue;
    const remaining = segment.slice(match.index + match[0].length);
    const right = parseItemList(remaining, currency);
    if (right.length) return [left, ...right];
    if (isMetadataSegment(remaining)) return [left];
  }
  return [];
}

function isMetadataSegment(segment) {
  const text = segment.trim();
  return /^(?:invoice|quote|estimate|receipt)\b/i.test(text)
    || /^(?:add\s+)?(?:tax|vat)\b/i.test(text)
    || /^(?:add\s+)?\d+(?:\.\d+)?\s*%\s*(?:tax|vat)\b/i.test(text)
    || /^discount\b/i.test(text)
    || /^due\b/i.test(text)
    || /^(?:received|paid|payment(?:\s+of)?)\b/i.test(text);
}

export function parseQuickCreate(input, { defaultCurrency = "ZAR" } = {}) {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) throw validation("text is required");
  if (text.length > MAX_INPUT_LENGTH) throw validation(`text must be ${MAX_INPUT_LENGTH} characters or fewer`);

  const warnings = [];
  const unparsed = [];
  const lower = text.toLowerCase();
  const documentType = /\breceipt\b/.test(lower) ? "receipt" : /\bquote\b|\bestimate\b/.test(lower) ? "quote" : "invoice";
  const currencyResult = currencyFrom(text, defaultCurrency);
  if (currencyResult.defaulted) warnings.push(`Currency omitted; defaulted to ${currencyResult.currency}`);
  const result = {
    document_type: documentType,
    currency: currencyResult.currency,
    currency_defaulted: currencyResult.defaulted,
    customer: {},
    items: [],
    tax_bps: 0,
    discount_bps: 0,
    due_in_days: null,
    due_date: null,
    payment: null,
    warnings,
    unparsed_segments: unparsed
  };

  const client = text.match(/\b(?:for|to)\s+([A-Za-z0-9][A-Za-z0-9 .&'()-]{1,80}?)(?=\s*(?:,|;|\||\bdue\b|\bwith\b|\bfor\s+\d|$))/i);
  if (client) result.customer.name = client[1].trim();
  else warnings.push("Customer name was not recognised");

  const dueDays = text.match(/\bdue\s+(?:in\s+)?(\d{1,3})\s+days?\b/i);
  const dueDate = text.match(/\bdue\s+(\d{4}-\d{2}-\d{2})\b/i);
  if (dueDays) result.due_in_days = Number(dueDays[1]);
  if (dueDate) result.due_date = dueDate[1];
  if (/\bdue\b/i.test(text) && !dueDays && !dueDate) warnings.push("Due date must use 'due in 14 days' or YYYY-MM-DD");

  const tax = text.match(/\b(?:add\s+)?(?:tax|vat)\s*(\d{1,2}(?:\.\d+)?)\s*%|\b(?:add\s+)?(\d{1,2}(?:\.\d+)?)\s*%\s*(?:tax|vat)\b/i);
  const discount = text.match(/\bdiscount\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
  if (tax) result.tax_bps = Math.round(Number(tax[1] || tax[2]) * 100);
  if (discount) result.discount_bps = Math.round(Number(discount[1]) * 100);
  if (result.tax_bps > 10000 || result.discount_bps > 10000) warnings.push("Tax and discount percentages must not exceed 100%");

  const payment = text.match(new RegExp(`\\b(?:received|paid|payment(?:\\s+of)?)\\s+(?:(${currencyPattern})\\s*|([${symbolPattern}])\\s*)?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)\\s*(?:(?:by|via|with)\\s+([^;|\\n]+)|([A-Za-z]+(?:\\s+[A-Za-z]+)?))?`, "i"));
  if (documentType === "receipt" && payment) {
    const amountMinor = amountToMinor(payment[3]);
    if (amountMinor !== null) result.payment = { amount_minor: amountMinor, method: (payment[4] || payment[5] || "unspecified").trim() };
  } else if (documentType === "receipt") {
    warnings.push("Receipt payment amount and method were not recognised");
  }

  const candidates = text.split(/[;\n|]+/).map((part) => part.trim()).filter(Boolean);
  for (const segment of candidates) {
    const items = parseItemList(segment, result.currency);
    if (items.length) result.items.push(...items);
    else if (!isMetadataSegment(segment)) unparsed.push(segment);
  }
  for (const segment of unparsed) warnings.push(`Unparsed segment: ${segment}`);
  if (!result.items.length && documentType !== "receipt") warnings.push("No line items were recognised; use '2 x Design @ R1,250.00'");
  return result;
}

export { MAX_INPUT_LENGTH };
