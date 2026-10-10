// Borrow & Return workflow.
// Stage 1: works against sample data in memory. Stage 5 saves to Supabase.
import { students, equipment, transactions, findEquipment, findStudent, findStudentByNumber } from "../sample-data.js";
import {
  renderShell, setPreviewRole, escapeHtml, formatDate, toDateInputValue, daysUntil,
  loanStatus, statusTag, stockTag, equipmentThumb, initials, toast,
} from "../app.js";

setPreviewRole("admin");
renderShell({ role: "admin", active: "borrow.html" });

const $ = (id) => document.getElementById(id);

// Tabs ---------------------------------------------------------------------------
const tabs = document.querySelectorAll("[data-mode]");
function setMode(mode) {
  tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.mode === mode)));
  $("borrow-panel").hidden = mode !== "borrow";
  $("return-panel").hidden = mode !== "return";
  history.replaceState(null, "", mode === "return" ? "#return" : location.pathname);
}
tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

// =============================================================================
// BORROW
// =============================================================================
const borrow = { studentId: null, equipmentId: null, checked: new Set() };

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

function selectStudent() {
  const student = findStudentFromInput();
  if (!student) {
    borrow.studentId = null;
    $("student-result").innerHTML = '<p class="hint" style="color:var(--red);margin-top:10px">No student found with that number or name.</p>';
    renderSlip();
    return;
  }
  borrow.studentId = student.id;
  const open = transactions.filter((t) => t.studentId === student.id && !t.returnedAt);
  const overdue = open.filter((t) => loanStatus(t) === "overdue").length;
  $("student-result").innerHTML = `
    <div class="person">
      <div class="avatar">${initials(student.name)}</div>
      <div class="grow" style="flex:1">
        <div class="cell-main">${escapeHtml(student.name)}</div>
        <div class="cell-sub"><span class="mono">${student.studentNo}</span> · ${escapeHtml(student.course)}, Year ${student.year}</div>
      </div>
      ${overdue ? `<span class="tag red">${overdue} overdue</span>` : `<span class="tag plain">${open.length} open loan${open.length === 1 ? "" : "s"}</span>`}
    </div>`;
  renderSlip();
}

$("find-student").addEventListener("click", selectStudent);
$("student-search").addEventListener("keydown", (e) => { if (e.key === "Enter") selectStudent(); });
$("student-search").addEventListener("change", selectStudent);

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

$("equip-search").addEventListener("input", renderEquipmentPick);
$("equip-pick").addEventListener("click", (e) => {
  const li = e.target.closest("[data-id]");
  if (!li || li.getAttribute("aria-disabled") === "true") return;
  borrow.equipmentId = li.dataset.id;
  borrow.checked = new Set();
  const item = findEquipment(borrow.equipmentId);
  $("qty").max = item.available;
  if (Number($("qty").value) > item.available) $("qty").value = item.available;
  renderEquipmentPick();
  renderChecklistOut();
  renderSlip();
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
  if (!item) return "Choose the equipment being borrowed.";
  if (!Number.isInteger(qty) || qty < 1) return "Quantity must be at least 1.";
  if (qty > item.available) return `Only ${item.available} available.`;
  if (!dueInput.value || daysUntil(dueInput.value + "T12:00") < 0) return "Pick a due date from today onward.";
  if (borrow.checked.size < item.components.length) return "Tick every component before handing it over.";
  return "";
}

$("confirm-borrow").addEventListener("click", () => {
  const problem = validateBorrow();
  if (problem) { toast(problem, "error"); return; }
  const item = findEquipment(borrow.equipmentId);
  const qty = Number($("qty").value);
  const tx = {
    id: `tx-${Math.max(...transactions.map((t) => Number(t.id.slice(3)))) + 1}`,
    studentId: borrow.studentId,
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
  toast(`${tx.id.toUpperCase()} recorded: ${item.name} × ${qty} (preview only, not saved).`);

  // Reset for the next borrower.
  Object.assign(borrow, { studentId: null, equipmentId: null, checked: new Set() });
  $("student-search").value = "";
  $("student-result").innerHTML = "";
  $("equip-search").value = "";
  $("qty").value = 1;
  $("notes").value = "";
  renderEquipmentPick();
  renderChecklistOut();
  renderSlip();
  renderLoanPick();
});

// =============================================================================
// RETURN
// =============================================================================
const ret = { txId: null, checked: new Set() };

function renderLoanPick() {
  const q = $("loan-search").value.trim().toLowerCase();
  const open = transactions
    .filter((t) => !t.returnedAt)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .filter((t) => {
      const s = findStudent(t.studentId); const e = findEquipment(t.equipmentId);
      return !q || `${s.name} ${s.studentNo} ${e?.name} ${t.id}`.toLowerCase().includes(q);
    });
  $("loan-pick").innerHTML = open.map((t) => {
    const s = findStudent(t.studentId); const e = findEquipment(t.equipmentId);
    return `
      <li role="option" data-id="${t.id}" aria-selected="${t.id === ret.txId}">
        <div class="grow">
          <div class="cell-main">${escapeHtml(e?.name ?? "Deleted item")} × ${t.quantity}</div>
          <div class="cell-sub">${escapeHtml(s.name)} · <span class="mono">${t.id.toUpperCase()}</span> · due ${formatDate(t.dueAt)}</div>
        </div>
        ${statusTag(t)}
      </li>`;
  }).join("") || '<li class="empty">No open loans.</li>';
}

$("loan-search").addEventListener("input", renderLoanPick);
$("loan-pick").addEventListener("click", (e) => {
  const li = e.target.closest("[data-id]");
  if (!li) return;
  ret.txId = li.dataset.id;
  ret.checked = new Set();
  renderLoanPick();
  renderChecklistIn();
  renderReturnSlip();
});

function renderChecklistIn() {
  const tx = transactions.find((t) => t.id === ret.txId);
  $("return-empty").hidden = Boolean(tx);
  if (!tx) { $("checklist-in").innerHTML = ""; $("return-count").textContent = ""; return; }
  $("checklist-in").innerHTML = tx.checklistOut.map((c, i) => `
    <li><label><input type="checkbox" data-part="${i}" ${ret.checked.has(c) ? "checked" : ""}> ${escapeHtml(c)}</label></li>`).join("");
  $("return-count").textContent = `${ret.checked.size} / ${tx.checklistOut.length} returned`;
}

$("checklist-in").addEventListener("change", (e) => {
  const tx = transactions.find((t) => t.id === ret.txId);
  const part = tx.checklistOut[Number(e.target.dataset.part)];
  e.target.checked ? ret.checked.add(part) : ret.checked.delete(part);
  $("return-count").textContent = `${ret.checked.size} / ${tx.checklistOut.length} returned`;
  renderReturnSlip();
});

function renderReturnSlip() {
  const tx = transactions.find((t) => t.id === ret.txId);
  if (!tx) { $("return-slip").innerHTML = '<dt>Loan</dt><dd class="muted">—</dd>'; return; }
  const s = findStudent(tx.studentId); const e = findEquipment(tx.equipmentId);
  const missing = tx.checklistOut.length - ret.checked.size;
  $("return-slip").innerHTML = `
    <dt>Ref</dt><dd><span class="code-tag">${tx.id.toUpperCase()}</span></dd>
    <dt>Student</dt><dd>${escapeHtml(s.name)}</dd>
    <dt>Item</dt><dd>${escapeHtml(e?.name ?? "Deleted item")} × ${tx.quantity}</dd>
    <dt>Due</dt><dd>${formatDate(tx.dueAt)} ${statusTag(tx)}</dd>
    <dt>Missing</dt><dd>${missing ? `<span class="tag amber">${missing} part${missing === 1 ? "" : "s"}</span>` : '<span class="tag green">None</span>'}</dd>`;
}

$("confirm-return").addEventListener("click", () => {
  const tx = transactions.find((t) => t.id === ret.txId);
  if (!tx) { toast("Select the loan being returned.", "error"); return; }
  const missing = tx.checklistOut.filter((c) => !ret.checked.has(c));
  if (missing.length && !confirm(`${missing.length} part(s) not ticked:\n• ${missing.join("\n• ")}\n\nRecord the return as incomplete?`)) return;

  tx.returnedAt = new Date().toISOString();
  tx.checklistIn = [...ret.checked];
  tx.notes = [tx.notes, $("return-notes").value.trim()].filter(Boolean).join(" · ");
  const item = findEquipment(tx.equipmentId);
  if (item) {
    item.available = Math.min(item.total, item.available + tx.quantity);
    if ($("return-condition").value !== "Good") item.condition = $("return-condition").value;
  }
  toast(`${tx.id.toUpperCase()} returned${missing.length ? " with missing parts" : ""} (preview only, not saved).`);

  Object.assign(ret, { txId: null, checked: new Set() });
  $("return-notes").value = "";
  $("return-condition").value = "Good";
  renderLoanPick();
  renderChecklistIn();
  renderReturnSlip();
  renderEquipmentPick();
});

// Initial render -------------------------------------------------------------------
renderEquipmentPick();
renderChecklistOut();
renderSlip();
renderLoanPick();
renderReturnSlip();
if (location.hash === "#return") setMode("return");
