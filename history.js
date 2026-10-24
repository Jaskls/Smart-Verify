// Transaction history — searchable, filterable list of every borrow and return.
import { transactions, findEquipment, getTransactionStudent } from "../sample-data.js";
import { renderShell, setPreviewRole, escapeHtml, formatDate, loanStatus, statusTag } from "../app.js";

setPreviewRole("admin");
renderShell({ role: "admin", active: "history.html" });

const search = document.getElementById("search");
const filterButtons = document.querySelectorAll("[data-status]");
let status = new URLSearchParams(location.search).get("status") || "";

function matchesStatus(tx) {
  const s = loanStatus(tx);
  if (!status) return true;
  if (status === "open") return s !== "returned";
  return s === status;
}

function render() {
  filterButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.status === status)));
  const q = search.value.trim().toLowerCase();
  const rows = [...transactions]
    .sort((a, b) => new Date(b.borrowedAt) - new Date(a.borrowedAt))
    .filter(matchesStatus)
    .filter((tx) => {
      const s = getTransactionStudent(tx);
      const e = findEquipment(tx.equipmentId);
      const borrower = `${s.name} ${s.studentNo} ${s.former ? "former student" : ""}`;
      return !q || `${tx.id} ${borrower} ${e?.name ?? ""} ${e?.tag ?? ""}`.toLowerCase().includes(q);
    });

  document.getElementById("history-body").innerHTML = rows.length
    ? rows.map((tx) => {
        const s = getTransactionStudent(tx);
        const e = findEquipment(tx.equipmentId);
        const back = tx.checklistIn
          ? `<span class="mono">${tx.checklistIn.length} / ${tx.checklistOut.length}</span>`
          : '<span class="muted">—</span>';
        const missing = tx.checklistIn ? tx.checklistOut.filter((c) => !tx.checklistIn.includes(c)) : [];
        return `
          <tr>
            <td><span class="code-tag">${tx.id.toUpperCase()}</span></td>
            <td><div class="cell-main">${escapeHtml(s.name)}${s.former ? ' <span class="tag plain">Former student</span>' : ""}</div><div class="cell-sub mono">${escapeHtml(s.studentNo || "Student ID unavailable")}</div></td>
            <td><div class="cell-main">${escapeHtml(e?.name ?? "Deleted item")}</div>${tx.notes ? `<div class="cell-sub">${escapeHtml(tx.notes)}</div>` : ""}</td>
            <td class="mono">${tx.quantity}</td>
            <td>${formatDate(tx.borrowedAt)}</td>
            <td>${formatDate(tx.dueAt)}</td>
            <td>${tx.returnedAt ? formatDate(tx.returnedAt) : '<span class="muted">—</span>'}</td>
            <td title="${missing.length ? "Missing: " + escapeHtml(missing.join(", ")) : ""}">${back}</td>
            <td>${statusTag(tx)}</td>
          </tr>`;
      }).join("")
    : '<tr><td colspan="9" class="empty">No transactions match.</td></tr>';

  document.getElementById("result-count").textContent = `${rows.length} of ${transactions.length} transactions`;
}

filterButtons.forEach((b) => b.addEventListener("click", () => { status = b.dataset.status; render(); }));
search.addEventListener("input", render);
render();
