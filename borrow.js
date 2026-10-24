/* Borrow & Return workflow.
Now with: saved data, PIN check, overdue lockout + override code, Incomplete
returns, Undo (30 s), QR scanning (with typing as backup), offline simulation. */
import { students, equipment, transactions, findEquipment, findStudent, findStudentByNumber, getTransactionStudent } from "../sample-data.js";
import {
  renderShell, setPreviewRole, escapeHtml, formatDate, toDateInputValue, daysUntil,
  statusTag, stockTag, equipmentThumb, initials, toast, icon, photoImg,
} from "../app.js";
import { save } from "../store.js";
import {
  checkPin, isLockedOut, overdueLoans, createOverrideCode, useOverrideCode,
  partsToCheck, applyReturn, recordAction, undoLast, getUndoRemainingMs,
} from "../rules.js";
import { scanCode } from "../scan.js";

setPreviewRole("admin");
renderShell({ role: "admin", active: "borrow.html" });

const $ = (id) => document.getElementById(id);
const byDue = (a, b) => new Date(a.dueAt) - new Date(b.dueAt);

// Tabs 
const tabs = document.querySelectorAll("[data-mode]");
function setMode(mode) {
  tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.mode === mode)));
  $("borrow-panel").hidden = mode !== "borrow";
  $("return-panel").hidden = mode !== "return";
  history.replaceState(null, "", mode === "return" ? "#return" : location.pathname);
}
tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

// Turn on the controls that used to say "arrives in Stage 6" 
$("pin").disabled = false;
$("pin").maxLength = 4;
$("pin").placeholder = "4-digit PIN";
const scanButtons = [...document.querySelectorAll('button[title*="QR scanning"]')];
scanButtons.forEach((b) => { b.disabled = false; b.removeAttribute("title"); });

/* TOOL PHOTO POP-UP
After a tool is scanned, a big picture of the exact tool appears. Staff compare it with the real
tool and tap "Confirm". Resolves true when confirmed, false when cancelled. */
function showToolPhoto(item, confirmLabel = "Confirm, this is the tool") {
  let dlg = $("photo-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "photo-dialog";
    dlg.className = "modal";
    dlg.style.cssText = "border:2px solid var(--ink);border-radius:18px;padding:0;width:min(480px,calc(100vw - 32px));background:var(--card);color:var(--text);box-shadow:var(--shadow)";
    document.body.appendChild(dlg);
  }
  const photo = photoImg(item, item.name).replace("<img ", '<img style="width:100%;max-height:300px;object-fit:contain;background:var(--green-soft);border:2px solid var(--ink);border-radius:14px;box-shadow:var(--shadow)" ');
  dlg.innerHTML = `
    <div style="padding:20px">
      <p class="eyebrow" style="margin:0 0 8px;color:var(--green)">Check the real tool against this picture</p>
      ${photo}
      <h2 style="margin:14px 0 2px">${escapeHtml(item.name)}</h2>
      <p class="muted" style="margin:0 0 10px"><span class="mono">${escapeHtml(item.tag)}</span> · ${escapeHtml(item.location)}</p>
      <p style="font-size:13px;margin:0 0 4px"><strong>Parts:</strong> ${item.components.map(escapeHtml).join(", ")}</p>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button type="button" class="btn btn-green" id="photo-ok" style="flex:1">${escapeHtml(confirmLabel)}</button>
        <button type="button" class="btn" id="photo-no">Not the same</button>
      </div>
    </div>`;
  return new Promise((resolve) => {
    let done = false;
    const end = (v) => { if (done) return; done = true; dlg.close(); resolve(v); };
    dlg.querySelector("#photo-ok").onclick = () => end(true);
    dlg.querySelector("#photo-no").onclick = () => end(false);
    dlg.addEventListener("close", () => end(false), { once: true });
    dlg.showModal();
  });
}

// LIVE BORROW TIMER: any element with data-since="<ISO date>" counts up.
function elapsed(since) {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(since)) / 1000));
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
  return `${d ? d + "d " : ""}${h}h ${String(m).padStart(2, "0")}m ${String(x).padStart(2, "0")}s`;
}
setInterval(() => document.querySelectorAll("[data-since]").forEach((el) => { el.textContent = elapsed(el.dataset.since); }), 1000);

/* OFFLINE SIMULATION
Data is always saved on this device. When "offline" is on, each action is also
listed as "waiting to sync", then "synced" when we go back online. */
const DEMO_TOOLS = new URLSearchParams(location.search).has("demo");
const OFFLINE_KEY = "sv.offline";
const QUEUE_KEY = "sv.queue";
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } };
const writeQueue = (q) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* ignore */ } };
const simulatedOffline = () => localStorage.getItem(OFFLINE_KEY) === "1";
const isOffline = () => simulatedOffline() || !navigator.onLine; // real or simulated

const banner = document.createElement("div");
banner.style.cssText = "display:none;margin-bottom:16px;padding:12px 14px;border-radius:10px;border:1px solid #e0b4b4;background:#fdeeee;color:#7a1f1f;font-size:14px";
document.querySelector(".content").prepend(banner);

const offlineBtn = document.createElement("button");
offlineBtn.type = "button";
offlineBtn.className = "btn btn-sm";
offlineBtn.style.marginTop = "10px";
document.querySelector(".page-head > div").appendChild(offlineBtn);

function renderOffline() {
  const q = readQueue();
  offlineBtn.textContent = simulatedOffline() ? "Go back online" : "Simulate offline";
  offlineBtn.hidden = !DEMO_TOOLS || !navigator.onLine; // demo button only with ?demo in the address
  if (!isOffline()) { banner.style.display = "none"; return; }
  banner.style.display = "block";
  banner.innerHTML = `<strong>No connection.</strong> Changes are saved on this device and will sync when the connection returns.
    <div style="margin-top:6px;font-size:13px">Waiting to sync: <strong>${q.length}</strong></div>
    ${q.length ? `<ul style="margin:6px 0 0 18px;font-size:13px">${q.map((x) => `<li>${escapeHtml(x.label)}</li>`).join("")}</ul>` : ""}`;
}

function queueIfOffline(label) {
  if (!isOffline()) return;
  writeQueue([...readQueue(), { label, at: new Date().toISOString() }]);
  renderOffline();
}

function syncNow() {
  const n = readQueue().length;
  banner.style.display = "block";
  banner.style.background = "#fff7e0"; banner.style.borderColor = "#e6d199"; banner.style.color = "#6b5200";
  banner.innerHTML = `<strong>Back online.</strong> Syncing ${n} change${n === 1 ? "" : "s"}…`;
  setTimeout(() => {
    localStorage.removeItem(OFFLINE_KEY);
    writeQueue([]);
    banner.style.background = "#fdeeee"; banner.style.borderColor = "#e0b4b4"; banner.style.color = "#7a1f1f";
    renderOffline();
    toast(n ? `${n} change${n === 1 ? "" : "s"} synced.` : "Online. Nothing waiting to sync.");
  }, 1300);
}
offlineBtn.addEventListener("click", () => {
  if (!simulatedOffline()) { localStorage.setItem(OFFLINE_KEY, "1"); renderOffline(); return; }
  syncNow();
});
// Real Wi-Fi changes: show the banner when the signal drops, upload automatically when it returns.
window.addEventListener("offline", renderOffline);
window.addEventListener("online", () => { if (!simulatedOffline() && readQueue().length) syncNow(); else renderOffline(); });

// UNDO BAR (30 seconds after a borrow or return)
const undoBar = document.createElement("div");
undoBar.id = "undo-bar";
undoBar.className = "undo-bar";
undoBar.hidden = true;
undoBar.innerHTML = '<span>Action recorded.</span><button type="button" class="btn btn-sm" id="undo-btn"></button>';
document.body.appendChild(undoBar);
let undoTimer = null;

function tickUndo() {
  const ms = getUndoRemainingMs();
  if (ms <= 0) { undoBar.hidden = true; clearInterval(undoTimer); return; }
  $("undo-btn").textContent = `Undo (${Math.ceil(ms / 1000)}s)`;
}
function showUndo() {
  undoBar.hidden = false;
  tickUndo();
  clearInterval(undoTimer);
  undoTimer = setInterval(tickUndo, 500);
}
$("undo-btn").addEventListener("click", () => {
  const result = undoLast();
  if (!result.ok) { toast(result.reason, "error"); return; }
  save();
  undoBar.hidden = true;
  clearInterval(undoTimer);
  undoTimer = null;
  queueIfOffline("Undo last action");
  toast("Last action undone.");
  refreshAll();
});

function refreshAll() {
  renderEquipmentPick(); renderChecklistOut(); renderSlip();
  renderLoanPick(); renderChecklistIn(); renderReturnSlip();
  const s = findStudent(borrow.studentId);
  if (s) renderStudentCard(s);
}

// BORROW
const borrow = { studentId: null, equipmentId: null, checked: new Set(), override: false, pinTries: 0, photoOk: false };

$("student-options").innerHTML = students
  .map((s) => `<option value="${s.studentNo}">${escapeHtml(s.name)}</option>`).join("");

const dueInput = $("due");
dueInput.min = toDateInputValue(new Date());
dueInput.value = toDateInputValue(Date.now() + 7 * 24 * 60 * 60 * 1000);

function findStudentFromInput() {
  const q = $("student-search").value.trim().toLowerCase();
  if (!q) return null;
  return findStudentByNumber(q) || students.find((s) => s.name.toLowerCase().includes(q));
}

function renderStudentCard(student) {
  const open = transactions.filter((t) => t.studentId === student.id && !t.returnedAt);
  const overdue = overdueLoans(student.id).length;
  const locked = isLockedOut(student.id) && !borrow.override;
  $("student-result").innerHTML = `
    <div class="person">
      <div class="avatar">${initials(student.name)}</div>
      <div class="grow" style="flex:1">
        <div class="cell-main">${escapeHtml(student.name)}</div>
        <div class="cell-sub"><span class="mono">${student.studentNo}</span> · ${escapeHtml(student.course)}, Year ${student.year}</div>
      </div>
      ${overdue ? `<span class="tag red">${overdue} overdue</span>` : `<span class="tag plain">${open.length} open loan${open.length === 1 ? "" : "s"}</span>`}
    </div>
    ${locked ? `
      <div style="margin-top:12px;padding:12px;border:1px solid var(--red);border-radius:10px;background:#fdeeee">
        <strong>Borrowing is blocked.</strong> This student has ${overdue} overdue loan${overdue === 1 ? "" : "s"}.
        Return them first, or a supervisor can unlock one borrow with a one-time code.
        <div style="display:flex;gap:8px;margin-top:10px">
          <input class="input mono" id="ovr-code" placeholder="OVR-1234" autocomplete="off">
          <button class="btn" type="button" id="ovr-apply">Unlock</button>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" id="ovr-make" style="margin-top:6px">Supervisor: generate a code</button>
      </div>` : ""}
    ${isLockedOut(student.id) && borrow.override ? '<p class="hint" style="color:var(--green,#1a7f37);margin-top:10px">Override accepted. One borrow is allowed.</p>' : ""}`;

  if (locked) {
    $("ovr-apply").onclick = () => {
      if (useOverrideCode($("ovr-code").value)) {
        borrow.override = true;
        toast("Override accepted for one borrow.");
        renderStudentCard(student);
        renderSlip();
      } else {
        toast("That code is invalid or already used.", "error");
      }
    };
    $("ovr-make").onclick = () => toast(`Supervisor code: ${createOverrideCode()} (works once)`);
  }
}

function selectStudent() {
  const student = findStudentFromInput();
  if (!student) {
    borrow.studentId = null;
    $("student-result").innerHTML = '<p class="hint" style="color:var(--red);margin-top:10px">No student found with that number or name.</p>';
    renderSlip();
    return;
  }
  if (borrow.studentId !== student.id) { borrow.override = false; borrow.pinTries = 0; $("pin").value = ""; }
  borrow.studentId = student.id;
  renderStudentCard(student);
  renderSlip();
}

$("find-student").addEventListener("click", selectStudent);
$("student-search").addEventListener("keydown", (e) => { if (e.key === "Enter") selectStudent(); });
$("student-search").addEventListener("change", selectStudent);
$("pin").addEventListener("input", renderSlip);

function renderEquipmentPick() {
  const q = $("equip-search").value.trim().toLowerCase();
  const list = equipment.filter((e) => !q || `${e.name} ${e.tag}`.toLowerCase().includes(q));
  $("equip-pick").innerHTML = list.map((e) => `
    <li role="option" data-id="${e.id}" aria-selected="${e.id === borrow.equipmentId}" aria-disabled="${e.available === 0}">
      <div class="thumb">${equipmentThumb(e)}</div>
      <div class="grow">
        <div class="cell-main">${escapeHtml(e.name)}</div>
        <div class="cell-sub"><span class="mono">${escapeHtml(e.tag)}</span> · ${e.available} of ${e.total} available</div>
      </div>
      ${stockTag(e)}
    </li>`).join("") || '<li class="empty">No equipment found.</li>';
}

async function chooseEquipment(id) {
  const item = findEquipment(id);
  if (!item) return;
  if (item.available === 0) { toast(`${item.name} is out of stock.`, "error"); return; }
  const ok = await showToolPhoto(item);
  if (!ok) { toast("Not confirmed. Pick or scan the tool again.", "error"); return; }
  borrow.photoOk = true;
  borrow.equipmentId = id;
  borrow.checked = new Set();
  $("qty").max = item.available;
  if (Number($("qty").value) > item.available) $("qty").value = item.available;
  renderEquipmentPick();
  renderChecklistOut();
  renderSlip();
}

$("equip-search").addEventListener("input", renderEquipmentPick);
$("equip-pick").addEventListener("click", (e) => {
  const li = e.target.closest("[data-id]");
  if (!li || li.getAttribute("aria-disabled") === "true") return;
  chooseEquipment(li.dataset.id);
});

function renderChecklistOut() {
  const item = findEquipment(borrow.equipmentId);
  $("checklist-empty").hidden = Boolean(item);
  if (!item) { $("checklist-out").innerHTML = ""; $("check-count").textContent = ""; return; }
  $("checklist-out").innerHTML = item.components.map((c, i) => `
    <li><label><input type="checkbox" data-part="${i}" ${borrow.checked.has(c) ? "checked" : ""}> ${escapeHtml(c)}</label></li>`).join("");
  $("check-count").textContent = `${borrow.checked.size} / ${item.components.length} checked`;
}

$("checklist-out").addEventListener("change", (e) => {
  const item = findEquipment(borrow.equipmentId);
  const part = item.components[Number(e.target.dataset.part)];
  e.target.checked ? borrow.checked.add(part) : borrow.checked.delete(part);
  $("check-count").textContent = `${borrow.checked.size} / ${item.components.length} checked`;
  renderSlip();
});

["qty", "due"].forEach((id) => $(id).addEventListener("input", renderSlip));

function renderSlip() {
  const student = findStudent(borrow.studentId);
  const item = findEquipment(borrow.equipmentId);
  const due = dueInput.value;
  $("slip").innerHTML = `
    <dt>Student</dt><dd>${student ? escapeHtml(student.name) : '<span class="muted">—</span>'}</dd>
    <dt>Item</dt><dd>${item ? escapeHtml(item.name) : '<span class="muted">—</span>'}</dd>
    <dt>Quantity</dt><dd class="mono">${$("qty").value || "—"}</dd>
    <dt>Due</dt><dd>${due ? `${formatDate(due + "T12:00")} <span class="muted">(${daysUntil(due + "T12:00")}d)</span>` : "—"}</dd>
    <dt>Parts</dt><dd class="mono">${item ? `${borrow.checked.size} / ${item.components.length}` : "—"}</dd>`;
  $("borrow-hint").textContent = validateBorrow() || "Ready to hand over.";
}

function validateBorrow() {
  const item = findEquipment(borrow.equipmentId);
  const qty = Number($("qty").value);
  if (!borrow.studentId) return "Find the student first.";
  if (isLockedOut(borrow.studentId) && !borrow.override) return "Blocked: this student has an overdue loan.";
  if (!item) return "Choose the equipment being borrowed.";
  if (!borrow.photoOk) return "Confirm the tool photo first.";
  if (!Number.isInteger(qty) || qty < 1) return "Quantity must be at least 1.";
  if (qty > item.available) return `Only ${item.available} available.`;
  if (!dueInput.value || daysUntil(dueInput.value + "T12:00") < 0) return "Pick a due date from today onward.";
  if (borrow.checked.size < item.components.length) return "Tick every component before handing it over.";
  if (!/^\d{4}$/.test($("pin").value)) return "Enter the student's 4-digit PIN.";
  return "";
}

$("confirm-borrow").addEventListener("click", () => {
  const problem = validateBorrow();
  if (problem) { toast(problem, "error"); return; }

  // PIN check
  if (!checkPin(borrow.studentId, $("pin").value)) {
    borrow.pinTries += 1;
    $("pin").value = "";
    if (borrow.pinTries >= 3) {
      toast("Too many wrong PINs. Start again with the student's ID.", "error");
      Object.assign(borrow, { studentId: null, override: false, pinTries: 0 });
      $("student-search").value = "";
      $("student-result").innerHTML = "";
      renderSlip();
    } else {
      toast(`Wrong PIN (${borrow.pinTries} of 3).`, "error");
      renderSlip();
    }
    return;
  }

  const item = findEquipment(borrow.equipmentId);
  const qty = Number($("qty").value);
  const availableBefore = item.available;
  const conditionBefore = item.condition;
  const borrower = findStudent(borrow.studentId);
  const tx = {
    id: `tx-${Math.max(...transactions.map((t) => Number(t.id.slice(3)))) + 1}`,
    studentId: borrow.studentId,
    studentNameSnapshot: borrower.name,
    studentNoSnapshot: borrower.studentNo,
    equipmentId: item.id,
    quantity: qty,
    borrowedAt: new Date().toISOString(),
    dueAt: new Date(dueInput.value + "T17:00").toISOString(),
    returnedAt: null,
    checklistOut: [...borrow.checked],
    checklistIn: null,
    notes: $("notes").value.trim(),
  };
  transactions.unshift(tx);
  item.available -= qty;

  recordAction({ type: "borrow", txId: tx.id, equipmentId: item.id, availableBefore, conditionBefore });
  save();
  queueIfOffline(`Borrow ${tx.id.toUpperCase()}: ${item.name} × ${qty}`);
  showUndo();
  toast(`${tx.id.toUpperCase()} recorded: ${item.name} × ${qty}.`);

  // Reset for the next borrower.
  Object.assign(borrow, { studentId: null, equipmentId: null, checked: new Set(), override: false, pinTries: 0, photoOk: false });
  $("student-search").value = "";
  $("student-result").innerHTML = "";
  $("equip-search").value = "";
  $("qty").value = 1;
  $("notes").value = "";
  $("pin").value = "";
  renderEquipmentPick();
  renderChecklistOut();
  renderSlip();
  renderLoanPick();
});

// Scan: student ID (QR holds the student number, e.g. 2024-00117) 
scanButtons[0]?.addEventListener("click", async () => {
  const code = await scanCode("Scan the student ID");
  if (!code) return;
  $("student-search").value = code;
  selectStudent();
});

// Scan: tool (QR holds the asset tag, e.g. SV-EQ-0009)
const scanToolBtn = document.createElement("button");
scanToolBtn.type = "button";
scanToolBtn.className = "btn btn-block";
scanToolBtn.innerHTML = `${icon("qr")} Scan tool QR`;
scanToolBtn.style.margin = "10px 0 0";
$("equip-search").closest(".input-icon").insertAdjacentElement("afterend", scanToolBtn);
scanToolBtn.addEventListener("click", async () => {
  const code = await scanCode("Scan the tool's QR sticker");
  if (!code) return;
  const item = equipment.find((e) => e.tag.toLowerCase() === code.toLowerCase());
  if (!item) { toast(`No tool with code "${code}". Try typing it in the search box.`, "error"); return; }
  chooseEquipment(item.id);
});

// RETURN
const ret = { txId: null, checked: new Set() };
const currentLoan = () => transactions.find((t) => t.id === ret.txId);

function renderLoanPick() {
  const q = $("loan-search").value.trim().toLowerCase();
  const open = transactions
    .filter((t) => !t.returnedAt)
    .sort(byDue)
    .filter((t) => {
      const s = getTransactionStudent(t); const e = findEquipment(t.equipmentId);
      return !q || `${s.name} ${s.studentNo} ${e?.name} ${e?.tag} ${t.id}`.toLowerCase().includes(q);
    });
  $("loan-pick").innerHTML = open.map((t) => {
    const s = getTransactionStudent(t); const e = findEquipment(t.equipmentId);
    return `
      <li role="option" data-id="${t.id}" aria-selected="${t.id === ret.txId}">
        <div class="grow">
          <div class="cell-main">${escapeHtml(e?.name ?? "Deleted item")} × ${t.quantity}</div>
          <div class="cell-sub">${escapeHtml(s.name)}${s.former ? " · Former student" : ""} · <span class="mono">${t.id.toUpperCase()}</span> · due ${formatDate(t.dueAt)} · out <span class="mono" data-since="${t.borrowedAt}">${elapsed(t.borrowedAt)}</span></div>
        </div>
        ${statusTag(t)}
      </li>`;
  }).join("") || '<li class="empty">No open loans.</li>';
}

function selectLoan(id) {
  ret.txId = id;
  ret.checked = new Set();
  renderLoanPick();
  renderChecklistIn();
  renderReturnSlip();
}

$("loan-search").addEventListener("input", renderLoanPick);
$("loan-pick").addEventListener("click", (e) => {
  const li = e.target.closest("[data-id]");
  if (li) selectLoan(li.dataset.id);
});

function renderChecklistIn() {
  const tx = currentLoan();
  $("return-empty").hidden = Boolean(tx);
  if (!tx) { $("checklist-in").innerHTML = ""; $("return-count").textContent = ""; return; }
  const parts = partsToCheck(tx);
  $("checklist-in").innerHTML = parts.map((c, i) => `
    <li><label><input type="checkbox" data-part="${i}" ${ret.checked.has(c) ? "checked" : ""}> ${escapeHtml(c)}</label></li>`).join("");
  $("return-count").textContent = `${ret.checked.size} / ${parts.length} returned`;
}

$("checklist-in").addEventListener("change", (e) => {
  const tx = currentLoan();
  const parts = partsToCheck(tx);
  const part = parts[Number(e.target.dataset.part)];
  e.target.checked ? ret.checked.add(part) : ret.checked.delete(part);
  $("return-count").textContent = `${ret.checked.size} / ${parts.length} returned`;
  renderReturnSlip();
});

function renderReturnSlip() {
  const tx = currentLoan();
  if (!tx) { $("return-slip").innerHTML = '<dt>Loan</dt><dd class="muted">—</dd>'; return; }
  const s = getTransactionStudent(tx); const e = findEquipment(tx.equipmentId);
  const parts = partsToCheck(tx);
  const missing = parts.length - [...ret.checked].filter((p) => parts.includes(p)).length;
  const earlier = tx.missing?.length ? `<dt>History</dt><dd><span class="tag amber">Earlier return was incomplete</span></dd>` : "";
  $("return-slip").innerHTML = `
    <dt>Ref</dt><dd><span class="code-tag">${tx.id.toUpperCase()}</span></dd>
    <dt>Student</dt><dd>${escapeHtml(s.name)}${s.former ? ' <span class="tag plain">Former student</span>' : ""}</dd>
    <dt>Item</dt><dd>${escapeHtml(e?.name ?? "Deleted item")} × ${tx.quantity}</dd>
    <dt>Due</dt><dd>${formatDate(tx.dueAt)} ${statusTag(tx)}</dd>
    <dt>Borrowed for</dt><dd class="mono" data-since="${tx.borrowedAt}">${elapsed(tx.borrowedAt)}</dd>
    ${earlier}
    <dt>Missing</dt><dd>${missing ? `<span class="tag amber">${missing} part${missing === 1 ? "" : "s"}</span>` : '<span class="tag green">None</span>'}</dd>`;
}

$("confirm-return").addEventListener("click", () => {
  const tx = currentLoan();
  if (!tx) { toast("Select the loan being returned.", "error"); return; }
  const parts = partsToCheck(tx);
  const missing = parts.filter((c) => !ret.checked.has(c));
  if (missing.length && !confirm(
    `${missing.length} part(s) not ticked:\n• ${missing.join("\n• ")}\n\n` +
    "Mark this return as INCOMPLETE?\nThe loan stays open under the student's name until the missing part is brought back."
  )) return;

  const item = findEquipment(tx.equipmentId);
  const before = {
    txBefore: JSON.parse(JSON.stringify(tx)),
    availableBefore: item?.available,
    conditionBefore: item?.condition,
  };
  const result = applyReturn(tx, [...ret.checked], {
    condition: $("return-condition").value,
    notes: $("return-notes").value.trim(),
  });

  recordAction({ type: "return", txId: tx.id, equipmentId: tx.equipmentId, ...before });
  save();
  queueIfOffline(`${result.complete ? "Return" : "Incomplete return"} ${tx.id.toUpperCase()}`);
  showUndo();
  if (result.complete) toast(`${tx.id.toUpperCase()} returned complete.`);
  else toast(`${tx.id.toUpperCase()} is INCOMPLETE. ${result.missing.length} part(s) still missing.`, "error");

  Object.assign(ret, { txId: null, checked: new Set() });
  $("return-notes").value = "";
  $("return-condition").value = "Good";
  renderLoanPick();
  renderChecklistIn();
  renderReturnSlip();
  renderEquipmentPick();
});

// Scan: tool on return
scanButtons[1]?.addEventListener("click", async () => {
  const code = await scanCode("Scan the tool being returned");
  if (!code) return;
  const item = equipment.find((e) => e.tag.toLowerCase() === code.toLowerCase());
  if (!item) { toast(`No tool with code "${code}".`, "error"); return; }
  const loans = transactions.filter((t) => !t.returnedAt && t.equipmentId === item.id).sort(byDue);
  if (!loans.length) { toast("No open loan for that tool.", "error"); return; }
  if (!(await showToolPhoto(item, "Confirm, this is the returned tool"))) return;
  selectLoan(loans[0].id);
  if (loans.length > 1) toast(`${loans.length} open loans for this tool. Showing the earliest due.`);
});

// Initial render 
renderEquipmentPick();
renderChecklistOut();
renderSlip();
renderLoanPick();
renderReturnSlip();
renderOffline();
// Show the right tab on load, and again whenever the address changes
// (e.g. clicking a "#return" link while already on this page, or the sidebar link).
const modeFromHash = () => (location.hash === "#return" ? "return" : "borrow");
setMode(modeFromHash());
window.addEventListener("hashchange", () => setMode(modeFromHash()));
