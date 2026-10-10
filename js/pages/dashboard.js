// Admin dashboard — summary of stock and loans.
import { equipment, transactions, findEquipment, findStudent } from "../sample-data.js";
import {
  renderShell, setPreviewRole, escapeHtml, formatDate, daysUntil,
  loanStatus, statusTag, equipmentThumb,
} from "../app.js";

setPreviewRole("admin");
renderShell({ role: "admin", active: "dashboard.html" });

document.getElementById("today-label").textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long", month: "long", day: "numeric",
});

// Summary tiles ------------------------------------------------------------------
const open = transactions.filter((t) => !t.returnedAt);
const overdue = open.filter((t) => loanStatus(t) === "overdue");
const totalUnits = equipment.reduce((sum, e) => sum + e.total, 0);
const availableUnits = equipment.reduce((sum, e) => sum + e.available, 0);

const tiles = [
  { label: "Equipment types", value: equipment.length, note: `${totalUnits} units in total` },
  { label: "Units available", value: availableUnits, note: `${Math.round((availableUnits / totalUnits) * 100)}% of stock on shelf` },
  { label: "Open loans", value: open.length, note: `${open.reduce((s, t) => s + t.quantity, 0)} units with students` },
  { label: "Overdue", value: overdue.length, note: overdue.length ? "Follow up today" : "All on time", alert: overdue.length > 0 },
];

document.getElementById("stats").innerHTML = tiles.map((t) => `
  <div class="card stat ${t.alert ? "alert" : ""}">
    <div class="stat-label">${t.label}</div>
    <div class="stat-value">${t.value}</div>
    <div class="stat-note">${t.note}</div>
  </div>`).join("");

// Needs attention: overdue first, then soonest due ---------------------------------
const attention = [...open].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)).slice(0, 5);
document.getElementById("attention-list").innerHTML = attention.length
  ? attention.map((tx) => {
      const item = findEquipment(tx.equipmentId);
      const student = findStudent(tx.studentId);
      return `
        <li>
          <div class="thumb">${equipmentThumb(item)}</div>
          <div class="grow">
            <div class="cell-main">${escapeHtml(item.name)} × ${tx.quantity}</div>
            <div class="cell-sub">${escapeHtml(student.name)} · due ${formatDate(tx.dueAt)}</div>
          </div>
          ${statusTag(tx)}
        </li>`;
    }).join("")
  : '<li class="empty">No open loans. Everything is on the shelf.</li>';

// Stock levels: lowest availability first ------------------------------------------
const byStock = [...equipment].sort((a, b) => a.available / a.total - b.available / b.total).slice(0, 5);
document.getElementById("stock-list").innerHTML = byStock.map((item) => {
  const pct = Math.round((item.available / item.total) * 100);
  const cls = item.available === 0 ? "empty-stock" : pct <= 20 ? "low" : "";
  return `
    <li>
      <div class="grow">
        <div class="cell-main">${escapeHtml(item.name)}</div>
        <div class="cell-sub mono">${item.available} / ${item.total} available</div>
      </div>
      <div class="meter ${cls}" role="img" aria-label="${pct}% available"><i style="width:${pct}%"></i></div>
    </li>`;
}).join("");

// Recent activity ---------------------------------------------------------------
const recent = [...transactions].sort((a, b) => new Date(b.borrowedAt) - new Date(a.borrowedAt)).slice(0, 6);
document.getElementById("recent-body").innerHTML = recent.map((tx) => {
  const item = findEquipment(tx.equipmentId);
  const student = findStudent(tx.studentId);
  return `
    <tr>
      <td><span class="code-tag">${tx.id.toUpperCase()}</span></td>
      <td><div class="cell-main">${escapeHtml(student.name)}</div><div class="cell-sub mono">${student.studentNo}</div></td>
      <td>${escapeHtml(item.name)}</td>
      <td class="mono">${tx.quantity}</td>
      <td>${formatDate(tx.borrowedAt)}<div class="cell-sub">${Math.abs(daysUntil(tx.borrowedAt))}d ago</div></td>
      <td>${statusTag(tx)}</td>
    </tr>`;
}).join("");
