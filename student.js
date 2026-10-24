// Student portal — the signed-in student's own loans.
// Stage 1 shows a fixed sample student. Stage 3 uses the real signed-in account.
import { transactions, findEquipment, findStudent, previewStudentId } from "../sample-data.js";
import {
  renderShell, setPreviewRole, escapeHtml, formatDate, daysUntil,
  loanStatus, statusTag, equipmentThumb,
} from "../app.js";

setPreviewRole("student");
renderShell({ role: "student", active: "student.html" });

const me = findStudent(previewStudentId);
const mine = transactions.filter((t) => t.studentId === me.id);
const open = mine.filter((t) => !t.returnedAt).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
const past = mine.filter((t) => t.returnedAt).sort((a, b) => new Date(b.returnedAt) - new Date(a.returnedAt));

document.getElementById("greeting").textContent = `Hi, ${me.name.split(" ")[0]}`;

document.getElementById("id-card").innerHTML = `
  <div>
    <p class="eyebrow">Student ID</p>
    <h2>${escapeHtml(me.name)}</h2>
    <p class="mono" style="margin-top:4px">${me.studentNo}</p>
    <p style="margin-top:8px;color:#aeb9ca;font-size:14px">${escapeHtml(me.course)} · Year ${me.year}</p>
  </div>
  <div style="text-align:center">
    <div class="student-qr" id="student-qr" role="img" aria-label="Student ID QR code"></div>
    <p class="student-qr-label">Student ID QR</p>
  </div>`;
if (typeof window.QRCode === "function") new window.QRCode(document.getElementById("student-qr"), {
  text: me.studentNo,
  width: 92,
  height: 92,
  colorDark: "#191a23",
  colorLight: "#ffffff",
  correctLevel: window.QRCode.CorrectLevel.M,
});
else document.getElementById("student-qr").textContent = "QR needs an internet connection.";

document.getElementById("loan-cards").innerHTML = open.length
  ? open.map((tx) => {
      const item = findEquipment(tx.equipmentId);
      const d = daysUntil(tx.dueAt);
      const when = d < 0 ? `${Math.abs(d)} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "Due today" : `${d} day${d === 1 ? "" : "s"} left`;
      return `
        <article class="card loan-card ${loanStatus(tx) === "overdue" ? "overdue" : ""}">
          <div style="display:flex;gap:12px;align-items:center">
            <div class="thumb">${equipmentThumb(item)}</div>
            <div style="flex:1;min-width:0">
              <div class="cell-main">${escapeHtml(item.name)} × ${tx.quantity}</div>
              <div class="cell-sub mono">${tx.id.toUpperCase()} · ${escapeHtml(item.tag)}</div>
            </div>
          </div>
          <div>
            <div class="cell-sub">Return by ${formatDate(tx.dueAt)}</div>
            <div class="due">${when}</div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            ${statusTag(tx)}
            <span class="cell-sub">${tx.checklistOut.length} parts to return</span>
          </div>
        </article>`;
    }).join("")
  : '<div class="card empty">You have nothing borrowed right now.</div>';

document.getElementById("past-body").innerHTML = past.length
  ? past.map((tx) => {
      const item = findEquipment(tx.equipmentId);
      return `
        <tr>
          <td><span class="code-tag">${tx.id.toUpperCase()}</span></td>
          <td>${escapeHtml(item?.name ?? "Deleted item")}</td>
          <td class="mono">${tx.quantity}</td>
          <td>${formatDate(tx.borrowedAt)}</td>
          <td>${formatDate(tx.returnedAt)}</td>
          <td>${statusTag(tx)}</td>
        </tr>`;
    }).join("")
  : '<tr><td colspan="6" class="empty">No past borrowings yet.</td></tr>';
