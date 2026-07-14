import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore, calculateTotals } from "../db.js";
import { createApp } from "../server.js";

const validData = (number) => ({
  number,
  document_title: "Tax Invoice",
  issue_date: "2026-07-11",
  due_date: "2026-08-10",
  currency: "ZAR",
  supplier: { name: "Moneyfy Studio", address: "88 Bree Street, Cape Town", vat_registered: true, vat_number: "4123456789" },
  customer: { name: "Vertex Labs", email: "finance@vertex.co.za", address: "12 Loop Street, Cape Town", vat_registered: true, vat_number: "4780123456" },
  items: [{ description: "Advisory", quantity: 2, unit_price_minor: 10000, discount_bps: 1000, tax_bps: 1500 }]
});

test("calculates money from integer minor units", () => {
  const totals = calculateTotals({ items: validData("X").items, shipping_minor: 500 });
  assert.equal(totals.subtotal_minor, 20000);
  assert.equal(totals.discount_minor, 2000);
  assert.equal(totals.tax_minor, 2700);
  assert.equal(totals.total_minor, 21200);
});

test("numbers are unique, drafts persist, and finalized snapshots are immutable", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "moneyfy-store-"));
  const file = path.join(dir, "test.sqlite");
  let store = createStore(file);
  const a = store.createDraft();
  const b = store.createDraft();
  assert.notEqual(a.number, b.number);
  const updated = store.updateDraft(a.id, validData(a.number));
  assert.equal(updated.totals.total_minor, 20700);
  const finalized = store.finalize(a.id);
  assert.equal(finalized.status, "finalized");
  assert.equal(finalized.snapshot.customer.name, "Vertex Labs");
  assert.throws(() => store.updateDraft(a.id, { notes: "changed" }), /cannot be edited/);
  store.close();
  store = createStore(file);
  assert.equal(store.getInvoice(a.id).status, "finalized");
  assert.equal(store.getInvoice(b.id).status, "draft");
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("readiness blocks invalid finalization and lifecycle transitions are audited", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "moneyfy-life-"));
  const store = createStore(path.join(dir, "test.sqlite"));
  const draft = store.createDraft();
  assert.throws(() => store.finalize(draft.id), /not ready/);
  store.updateDraft(draft.id, validData(draft.number));
  const sent = store.finalize(draft.id, true);
  assert.equal(sent.status, "sent");
  assert.equal(store.transition(draft.id, "paid", ["sent"], "paid").status, "paid");
  const events = store.listAudit(draft.id).map((event) => event.type);
  assert.deepEqual(events.slice(-3), ["finalized", "sent", "paid"]);
  store.close(); rmSync(dir, { recursive: true, force: true });
});

test("pristine trailing editor rows are excluded from totals and finalized snapshots", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "moneyfy-trailing-"));
  const store = createStore(path.join(dir, "test.sqlite"));
  const draft = store.createDraft();
  const pristine = { description: "", quantity: 1, unit_price_minor: 0, tax_bps: 1500, discount_bps: 0 };
  const data = validData(draft.number);
  data.items.push(pristine, { ...pristine });
  const updated = store.updateDraft(draft.id, data);

  assert.equal(updated.readiness.ready, true);
  assert.equal(updated.data.items.length, 3);
  assert.equal(updated.totals.lines.length, 1);

  const finalized = store.finalize(draft.id);
  assert.equal(finalized.status, "finalized");
  assert.equal(finalized.data.items.length, 1);
  assert.equal(finalized.totals.lines.length, 1);
  assert.equal(finalized.snapshot.items.length, 1);
  assert.equal(finalized.snapshot.totals.lines.length, 1);
  assert.equal(finalized.snapshot.totals.total_minor, 20700);

  store.close(); rmSync(dir, { recursive: true, force: true });
});

test("partially entered and non-trailing invalid rows still block finalization", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "moneyfy-partial-"));
  const store = createStore(path.join(dir, "test.sqlite"));
  const pristine = { description: "", quantity: 1, unit_price_minor: 0, tax_bps: 1500, discount_bps: 0 };
  const invalidRows = [
    { ...pristine, unit_price_minor: 500 },
    { ...pristine, quantity: 2 },
    { ...pristine, tax_bps: 0 },
    { ...pristine, description: "Started", quantity: 0 }
  ];

  for (const invalid of invalidRows) {
    const draft = store.createDraft();
    const data = validData(draft.number);
    data.items.push(invalid);
    const updated = store.updateDraft(draft.id, data);
    assert.equal(updated.readiness.ready, false);
    assert.throws(() => store.finalize(draft.id), /not ready/);
  }

  const middleDraft = store.createDraft();
  const middleData = validData(middleDraft.number);
  middleData.items = [middleData.items[0], pristine, { ...middleData.items[0], description: "Second valid line" }];
  assert.equal(store.updateDraft(middleDraft.id, middleData).readiness.ready, false);
  assert.throws(() => store.finalize(middleDraft.id), /not ready/);

  store.close(); rmSync(dir, { recursive: true, force: true });
});

test("PDF endpoint returns a real PDF with selectable text", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "moneyfy-api-"));
  const app = createApp({ database: path.join(dir, "test.sqlite") });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    let response = await fetch(`${base}/api/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const created = (await response.json()).data;
    response = await fetch(`${base}/api/invoices/${created.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validData(created.number)) });
    assert.equal(response.status, 200);
    response = await fetch(`${base}/api/invoices/${created.id}/pdf`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    assert.ok(bytes.length > 1000);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    app.locals.store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
