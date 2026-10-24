/* [for the decisions: PIN, lockout, override codes, returns, undo]

No buttons or screens in here. Pages call these functions and show the result. */
import { transactions, findEquipment } from "./sample-data.js";
import { loanStatus } from "./app.js";

// Pesudo testp ins
export const TEST_PINS = {
  "st-01": "1234", // Maria Santos
  "st-02": "2345", // John Reyes   (has an overdue loan, so he is blocked)
  "st-03": "3456", // Aisha Khan
  "st-04": "4567", // Daniel Cruz
  "st-05": "5678", // Lena Park
};

export function checkPin(studentId, pin) {
  return TEST_PINS[studentId] !== undefined && String(pin).trim() === TEST_PINS[studentId];
}

// Overdue lockout - Set to false if the lab has no overdue rule (the lockout is then switched off).
export const LOCKOUT_ENABLED = true;

export function overdueLoans(studentId) {
  return transactions.filter((t) => t.studentId === studentId && !t.returnedAt && loanStatus(t) === "overdue");
}

export function isLockedOut(studentId) {
  return LOCKOUT_ENABLED && overdueLoans(studentId).length > 0;
}

// One-time override codes (supervisor)
const OVR_KEY = "sv.overrides";
const readCodes = () => { try { return JSON.parse(localStorage.getItem(OVR_KEY) || "[]"); } catch { return []; } };
const writeCodes = (codes) => { try { localStorage.setItem(OVR_KEY, JSON.stringify(codes)); } catch { /* ignore */ } };

export function createOverrideCode() {
  const code = `OVR-${Math.floor(1000 + Math.random() * 9000)}`;
  writeCodes([...readCodes(), { code, used: false, createdAt: new Date().toISOString() }]);
  return code;
}

// Returns true once, then the code is used up.
export function useOverrideCode(input) {
  const wanted = String(input).trim().toUpperCase();
  const codes = readCodes();
  const hit = codes.find((c) => c.code === wanted && !c.used);
  if (!hit) return false;
  hit.used = true;
  hit.usedAt = new Date().toISOString();
  writeCodes(codes);
  return true;
}

// Returns and missing parts: If an earlier return was incomplete, only the missing parts still need checking.
export const missingParts = (tx) => (tx.missing && tx.missing.length ? tx.missing : []);
export const partsToCheck = (tx) => (missingParts(tx).length ? missingParts(tx) : tx.checklistOut);

/* ticked = names of the parts the custodian ticked. Changes tx and the stock count.
Complete   -> the loan is closed and stock goes back up.
Incomplete -> the loan stays OPEN under the student's name with tx.missing filled in */
export function applyReturn(tx, ticked, { condition = "Good", notes = "" } = {}) {
  const item = findEquipment(tx.equipmentId);
  const stillMissing = partsToCheck(tx).filter((p) => !ticked.includes(p));

  if (notes) tx.notes = [tx.notes, notes].filter(Boolean).join(" · ");
  if (item && condition !== "Good") item.condition = condition;

  if (stillMissing.length) {
    tx.missing = stillMissing;
    tx.checklistIn = tx.checklistOut.filter((p) => !stillMissing.includes(p));
    return { complete: false, missing: stillMissing };
  }

  delete tx.missing;
  tx.checklistIn = [...tx.checklistOut];
  tx.returnedAt = new Date().toISOString();
  if (item) item.available = Math.min(item.total, item.available + tx.quantity);
  return { complete: true, missing: [] };
}

// Undo (30 seconds)
export const UNDO_WINDOW_MS = 30 * 1000;
let lastAction = null;

// Call this right BEFORE-and-AFTER an action: pass what things looked like before.
//   borrow: { type:"borrow", txId, equipmentId, availableBefore, conditionBefore }
//   return: { type:"return", txId, equipmentId, availableBefore, conditionBefore, txBefore }
export function recordAction(action) {
  lastAction = { ...action, at: Date.now() };
}

export function getUndoRemainingMs() {
  return lastAction ? Math.max(0, UNDO_WINDOW_MS - (Date.now() - lastAction.at)) : 0;
}

export function undoLast(now = Date.now()) {
  const a = lastAction;
  if (!a) return { ok: false, reason: "Nothing to undo." };
  if (now - a.at > UNDO_WINDOW_MS) {
    lastAction = null;
    return { ok: false, reason: "The 30-second undo window has passed." };
  }
  const item = findEquipment(a.equipmentId);
  if (a.type === "borrow") {
    const i = transactions.findIndex((t) => t.id === a.txId);
    if (i >= 0) transactions.splice(i, 1);
  } else {
    const tx = transactions.find((t) => t.id === a.txId);
    if (tx) {
      Object.keys(tx).forEach((k) => delete tx[k]);
      Object.assign(tx, JSON.parse(JSON.stringify(a.txBefore)));
    }
  }
  if (item) {
    item.available = a.availableBefore;
    item.condition = a.conditionBefore;
  }
  lastAction = null;
  return { ok: true, type: a.type };
}