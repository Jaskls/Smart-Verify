/* Shared database-backed borrow and return workflow. */
import { students, equipment, transactions, findEquipment, findStudent, getTransactionStudent } from "../sample-data.js";
import {
  renderShell, escapeHtml, formatDate, toDateInputValue, daysUntil,
  statusTag, stockTag, equipmentThumb, initials, toast,
} from "../app.js";
import { requireProfile } from "../auth.js";
import { reloadData } from "../store.js";
import { getSupabase } from "../supabase.js";
import {
  isLockedOut, overdueLoans, partsToCheck,
} from "../rules.js";
import { scanCode } from "../scan.js";

const profile = await requireProfile("admin");
renderShell({ profile, active: "borrow.html" });

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

$("pin").disabled = false;
$("pin").maxLength = 4;
$("pin").placeholder = "4-digit PIN";
const scanButtons = [...document.querySelectorAll('button[title*="QR scanning"]')];
scanButtons.forEach((b) => { b.disabled = false; b.removeAttribute("title"); });

function refreshAll() {
  renderEquipmentPick(); renderChecklistOut(); renderSlip();
  renderLoanPick(); renderChecklistIn(); renderReturnSlip();
  const s = findStudent(borrow.studentId);
  if (s) renderStudentCard(s);
}

// BORROW
const borrow = { studentId: null, equipmentId: null, checked: new Set(), overrideCode: "" };

const dueInput = $("due");
dueInput.min = toDateInputValue(new Date());
dueInput.value = toDateInputValue(Date.now() + 7 * 24 * 60 * 60 * 1000);

function confirmScannedEquipment(item, action) {
  let dialog = $("equipment-scan-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "equipment-scan-dialog";
    dialog.className = "modal";
    document.body.appendChild(dialog);
  }

  dialog.innerHTML = `
    <div class="modal-head">
      <h2 id="equipment-scan-title">Check scanned equipment</h2>
      <button class="icon-btn" type="button" data-scan-cancel aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <div class="scan-equipment-photo"><div class="thumb">${equipmentThumb(item)}</div></div>
      <div>
        <h3 class="scan-equipment-name">${escapeHtml(item.name)}</h3>
        <p class="muted"><span class="mono">${escapeHtml(item.tag)}</span> · ${escapeHtml(item.location || "Location not set")}</p>
        <p class="muted">${item.available} of ${item.total} available</p>
        <p><strong>Components:</strong> ${item.components.map(escapeHtml).join(", ") || "None listed"}</p>
      </div>
      <p class="muted">${action === "borrow"
        ? "Confirm this is the equipment being checked out."
        : "Confirm this is the equipment being returned."}</p>
    </div>
    <div class="modal-foot">
      <button class="btn" type="button" data-scan-cancel>Cancel</button>
      <button class="btn btn-primary" type="button" data-scan-confirm>Confirm</button>
    </div>`;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      dialog.close();
      resolve(confirmed);
    };
    dialog.querySelectorAll("[data-scan-cancel]").forEach((button) => {
      button.addEventListener("click", () => finish(false), { once: true });
    });
    dialog.querySelector("[data-scan-confirm]").addEventListener("click", () => finish(true), { once: true });
    dialog.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, { once: true });
    dialog.showModal();
  });
}

function chooseLoanForScannedEquipment(loans) {
  let dialog = $("return-loan-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "return-loan-dialog";
    dialog.className = "modal";
    document.body.appendChild(dialog);
  }

  dialog.innerHTML = `
    <div class="modal-head">
      <h2>Choose the matching open loan</h2>
      <button class="icon-btn" type="button" data-loan-cancel aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="muted">More than one student has this equipment on loan. Select the correct student and loan before recording the return.</p>
      <ul class="list card" style="box-shadow:none">
        ${loans.map((loan) => {
          const student = getTransactionStudent(loan);
          return `<li>
            <div class="grow">
              <div class="cell-main">${escapeHtml(student.name)} · ${loan.quantity} unit${loan.quantity === 1 ? "" : "s"}</div>
              <div class="cell-sub">${escapeHtml(student.studentNo || "Student ID unavailable")} · due ${formatDate(loan.dueAt)} · ${loan.id.slice(0, 8).toUpperCase()}</div>
            </div>
            <button class="btn btn-sm" type="button" data-loan-id="${escapeHtml(loan.id)}">Select</button>
          </li>`;
        }).join("")}
      </ul>
    </div>
    <div class="modal-foot">
      <button class="btn" type="button" data-loan-cancel>Cancel</button>
    </div>`;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (loan) => {
      if (settled) return;
      settled = true;
      dialog.close();
      resolve(loan);
    };
    dialog.querySelectorAll("[data-loan-cancel]").forEach((button) => {
      button.addEventListener("click", () => finish(null), { once: true });
    });
    dialog.querySelectorAll("[data-loan-id]").forEach((button) => {
      button.addEventListener("click", () => {
        finish(loans.find((loan) => loan.id === button.dataset.loanId) ?? null);
      }, { once: true });
    });
    dialog.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, { once: true });
    dialog.showModal();
  });
}

function renderStudentCard(student) {
  const open = transactions.filter((t) => t.studentId === student.id && !t.returnedAt);
  const overdue = overdueLoans(student.id).length;
  const locked = isLockedOut(student.id);
  $("student-result").innerHTML = `
    <div class="person">
      <div class="avatar">${initials(student.name)}</div>
      <div class="grow" style="flex:1">
        <div class="cell-main">${escapeHtml(student.name)}</div>
        <div class="cell-sub"><span class="mono">${escapeHtml(student.studentNo)}</span> · Verified KLD account</div>
      </div>
      ${overdue ? `<span class="tag red">${overdue} overdue</span>` : `<span class="tag plain">${open.length} open loan${open.length === 1 ? "" : "s"}</span>`}
    </div>
    ${locked ? `
      <div style="margin-top:12px;padding:12px;border:1px solid var(--red);border-radius:10px;background:#fdeeee">
        <strong>Borrowing is blocked.</strong> This student has ${overdue} overdue loan${overdue === 1 ? "" : "s"}.
        Return them first, or a supervisor can authorize one borrow with a database-validated one-time code.
        <div style="display:flex;gap:8px;margin-top:10px">
          <input class="input mono" id="ovr-code" placeholder="OVR-..." autocomplete="off" value="${escapeHtml(borrow.overrideCode)}">
          <button class="btn" type="button" id="ovr-apply">${borrow.overrideCode ? "Update code" : "Use code"}</button>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" id="ovr-make" style="margin-top:6px">Supervisor: generate a code</button>
      </div>` : ""}
    ${isLockedOut(student.id) && borrow.overrideCode ? '<p class="hint" style="color:var(--green,#1a7f37);margin-top:10px">Supervisor code entered. It will be validated when checkout is submitted.</p>' : ""}`;

  if (locked) {
    $("ovr-apply").onclick = () => {
      const code = $("ovr-code").value.trim().toUpperCase();
      if (!code) { toast("Enter a supervisor code.", "error"); return; }
      borrow.overrideCode = code;
      toast("Supervisor code entered. It will be checked when the borrow is submitted.");
      renderStudentCard(student);
      renderSlip();
    };
    $("ovr-make").onclick = async () => {
      const button = $("ovr-make");
      button.disabled = true;
      try {
        const { data, error } = await getSupabase().rpc("create_equipment_loan_override");
        if (error) throw error;
        $("ovr-code").value = data;
        borrow.overrideCode = data;
        renderStudentCard(student);
        renderSlip();
        toast(`Supervisor code generated and entered. It can authorize one checkout.`);
      } catch (error) {
        toast(error.message || "Could not create a supervisor code.", "error");
      } finally {
        button.disabled = false;
      }
    };
  }
}

async function selectStudent() {
  const query = $("student-search").value.trim();
  if (!query) return;
  $("find-student").disabled = true;
  try {
    const { data, error } = await getSupabase().functions.invoke("student-pin-auth", {
      body: { action: "lookup_student", query },
    });
    if (error) {
      if (error.context instanceof Response) {
        const payload = await error.context.json().catch(() => null);
        if (typeof payload?.error === "string") throw new Error(payload.error);
      }
      throw new Error(error.message || "Could not search student accounts.");
    }
    const student = data.student;
    const existingIndex = students.findIndex((entry) => entry.id === student.id);
    const studentRecord = {
      id: student.id,
      studentNo: student.studentNo,
      name: student.name,
      course: "",
      year: "",
      email: "",
    };
    if (existingIndex < 0) students.push(studentRecord);
    else students[existingIndex] = studentRecord;

    if (borrow.studentId !== student.id) { borrow.overrideCode = ""; $("pin").value = ""; }
    borrow.studentId = student.id;
    renderStudentCard(studentRecord);
    renderSlip();
  } catch (error) {
    borrow.studentId = null;
    borrow.overrideCode = "";
    $("pin").value = "";
    $("student-result").innerHTML = `<p class="hint" style="color:var(--red);margin-top:10px">${escapeHtml(error.message || "Student search failed.")}</p>`;
    renderSlip();
  } finally {
    $("find-student").disabled = false;
  }
}

$("find-student").addEventListener("click", selectStudent);
$("student-search").addEventListener("keydown", (e) => { if (e.key === "Enter") selectStudent(); });
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

function chooseEquipment(id) {
  const item = findEquipment(id);
  if (!item) return;
  if (item.available === 0) { toast(`${item.name} is out of stock.`, "error"); return; }
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
  if (isLockedOut(borrow.studentId) && !borrow.overrideCode) return "Blocked: this student has an overdue loan.";
  if (!item) return "Choose the equipment being borrowed.";
  if (!Number.isInteger(qty) || qty < 1) return "Quantity must be at least 1.";
  if (qty > item.available) return `Only ${item.available} available.`;
  if (!dueInput.value || daysUntil(dueInput.value + "T12:00") < 0) return "Pick a due date from today onward.";
  if (borrow.checked.size < item.components.length) return "Tick every component before handing it over.";
  if (!/^\d{4}$/.test($("pin").value)) return "Enter the student's 4-digit PIN.";
  return "";
}

async function verifyStudentPin() {
  const { data, error } = await getSupabase().functions.invoke("student-pin-auth", {
    body: {
      action: "verify_student_pin",
      student_no: findStudent(borrow.studentId)?.studentNo,
      pin: $("pin").value,
    },
  });
  if (!error) return data;
  if (error.context instanceof Response) {
    const payload = await error.context.json().catch(() => null);
    if (typeof payload?.error === "string") throw new Error(payload.error);
  }
  throw new Error(error.message || "Could not verify the student's PIN.");
}

$("confirm-borrow").addEventListener("click", async () => {
  const problem = validateBorrow();
  if (problem) { toast(problem, "error"); return; }

  const item = findEquipment(borrow.equipmentId);
  const qty = Number($("qty").value);
  $("confirm-borrow").disabled = true;
  try {
    await verifyStudentPin();
    const { data, error } = await getSupabase().rpc("create_equipment_loan", {
      p_student_id: borrow.studentId,
      p_equipment_id: item.id,
      p_quantity: qty,
      p_due_at: new Date(dueInput.value + "T17:00").toISOString(),
      p_checklist_out: item.components,
      p_notes: $("notes").value.trim(),
      p_override_code: borrow.overrideCode || null,
    });
    if (error) throw error;
    Object.assign(borrow, { studentId: null, equipmentId: null, checked: new Set(), overrideCode: "" });
    $("student-search").value = "";
    $("student-result").innerHTML = "";
    $("equip-search").value = "";
    $("qty").value = 1;
    $("notes").value = "";
    $("pin").value = "";
    try {
      refreshAll();
      await reloadData();
      refreshAll();
      toast(`Loan ${data.id.slice(0, 8).toUpperCase()} recorded in Supabase: ${item.name} × ${qty}.`);
    } catch (refreshError) {
      toast(`Loan ${data.id.slice(0, 8).toUpperCase()} was saved, but the page could not refresh. Reload before recording another loan. ${refreshError.message || ""}`, "error");
    }
  } catch (error) {
    $("pin").value = "";
    renderSlip();
    toast(error.message || "Could not record the loan.", "error");
    return;
  } finally {
    $("confirm-borrow").disabled = false;
  }
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
scanToolBtn.className = "btn btn-sm";
scanToolBtn.textContent = "Scan tool QR";
scanToolBtn.style.margin = "10px 0 0";
$("equip-search").closest(".input-icon").insertAdjacentElement("afterend", scanToolBtn);
scanToolBtn.addEventListener("click", async () => {
  const code = await scanCode("Scan the tool's QR sticker");
  if (!code) return;
  const item = equipment.find((e) => e.tag.toLowerCase() === code.toLowerCase());
  if (!item) { toast(`No tool with code "${code}". Try typing it in the search box.`, "error"); return; }
  if (!await confirmScannedEquipment(item, "borrow")) return;
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
          <div class="cell-sub">${escapeHtml(s.name)}${s.former ? " · Former student" : ""} · <span class="mono">${t.id.toUpperCase()}</span> · due ${formatDate(t.dueAt)}</div>
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
    ${earlier}
    <dt>Missing</dt><dd>${missing ? `<span class="tag amber">${missing} part${missing === 1 ? "" : "s"}</span>` : '<span class="tag green">None</span>'}</dd>`;
}

$("confirm-return").addEventListener("click", async () => {
  const tx = currentLoan();
  if (!tx) { toast("Select the loan being returned.", "error"); return; }
  const parts = partsToCheck(tx);
  const missing = parts.filter((c) => !ret.checked.has(c));
  if (missing.length && !confirm(
    `${missing.length} part(s) not ticked:\n• ${missing.join("\n• ")}\n\n` +
    "Mark this return as INCOMPLETE?\nThe loan stays open under the student's name until the missing part is brought back."
  )) return;

  const returnedParts = [...new Set([...(tx.checklistIn ?? []), ...ret.checked])];
  $("confirm-return").disabled = true;
  try {
    const { data, error } = await getSupabase().rpc("record_equipment_return", {
      p_loan_id: tx.id,
      p_checklist_in: returnedParts,
      p_condition: $("return-condition").value,
      p_notes: $("return-notes").value.trim(),
    });
    if (error) throw error;
    Object.assign(ret, { txId: null, checked: new Set() });
    $("return-notes").value = "";
    $("return-condition").value = "Good";
    try {
      refreshAll();
      await reloadData();
      refreshAll();
      if (data.returned_at) toast(`${tx.id.slice(0, 8).toUpperCase()} returned complete.`);
      else toast(`${tx.id.slice(0, 8).toUpperCase()} is INCOMPLETE. ${data.missing.length} part(s) still missing.`, "error");
    } catch (refreshError) {
      toast(`Return for ${tx.id.slice(0, 8).toUpperCase()} was saved, but the page could not refresh. Reload before recording another return. ${refreshError.message || ""}`, "error");
    }
  } catch (error) {
    toast(error.message || "Could not record the return.", "error");
    return;
  } finally {
    $("confirm-return").disabled = false;
  }
});

// Scan: tool on return
scanButtons[1]?.addEventListener("click", async () => {
  const code = await scanCode("Scan the tool being returned");
  if (!code) return;
  const item = equipment.find((e) => e.tag.toLowerCase() === code.toLowerCase());
  if (!item) { toast(`No tool with code "${code}".`, "error"); return; }
  const loans = transactions.filter((t) => !t.returnedAt && t.equipmentId === item.id).sort(byDue);
  if (!loans.length) { toast("No open loan for that tool.", "error"); return; }
  if (!await confirmScannedEquipment(item, "return")) return;
  const loan = loans.length === 1 ? loans[0] : await chooseLoanForScannedEquipment(loans);
  if (loan) selectLoan(loan.id);
});

// Initial render 
renderEquipmentPick();
renderChecklistOut();
renderSlip();
renderLoanPick();
renderReturnSlip();
// Show the right tab on load, and again whenever the address changes
// (e.g. clicking a "#return" link while already on this page, or the sidebar link).
const modeFromHash = () => (location.hash === "#return" ? "return" : "borrow");
setMode(modeFromHash());
window.addEventListener("hashchange", () => setMode(modeFromHash()));
