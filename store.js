/* [for saving the demo data in the browser to survive page reload]
Process:
  • sample-data.js still holds the starting ("seed") data.
  • When any page loads, this file copies the saved data from localStorage
    INTO those same arrays, before the page code runs.
  • It saves again after changes (and every 2 seconds, and when you leave
    the page), so the other pages never need to know about saving.
  • "Reset demo" (small button, bottom-left) wipes saved data and reloads.

Only equipment and transactions r saved. Students come from the seed.
If the team changes sample-data.js, bump SEED_VERSION so old saves are ignored. */
import { equipment, students, transactions } from "./sample-data.js";

const SEED_VERSION = 2; // bumped: equipment now ships with photos
const KEY = "sv.data";

function hydrate() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.version !== SEED_VERSION) return; // seed changed, ignore old save
    if (Array.isArray(saved.equipment)) equipment.splice(0, equipment.length, ...saved.equipment);
    if (Array.isArray(saved.transactions)) transactions.splice(0, transactions.length, ...saved.transactions);
  } catch (err) {
    console.warn("Could not read saved data, using the seed data.", err);
  }
}

function preserveBorrowerSnapshots() {
  transactions.forEach((tx) => {
    const student = students.find((entry) => entry.id === tx.studentId);
    if (!student) return;
    if (!tx.studentNameSnapshot) tx.studentNameSnapshot = student.name;
    if (!tx.studentNoSnapshot) tx.studentNoSnapshot = student.studentNo;
  });
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: SEED_VERSION, equipment, transactions }));
  } catch (err) {
    console.warn("Could not save data.", err);
  }
}

export function resetDemo() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("sv.")).forEach((k) => localStorage.removeItem(k));
  } catch (err) { /* ignore */ }
  location.reload();
}

hydrate();
preserveBorrowerSnapshots();

// Keep saving without every page having to call save().
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
setInterval(save, 2000);

// Small "Reset demo" button on every page.
window.addEventListener("DOMContentLoaded", () => {
  if (!new URLSearchParams(location.search).has("demo")) return; // hidden for real use; add ?demo to the address to show it
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Reset demo";
  btn.title = "Erase saved changes and restore the starting data";
  btn.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:50;font:12px system-ui;padding:6px 10px;border:1px solid #c5ccd8;border-radius:8px;background:#fff;color:#555;cursor:pointer;opacity:.8";
  btn.addEventListener("click", () => {
    if (confirm("Reset the demo? All saved borrows and returns will be erased.")) resetDemo();
  });
  document.body.appendChild(btn);
});