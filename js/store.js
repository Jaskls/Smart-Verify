/* [for saving the sample inventory and loans in this browser]
Process:
  • sample-data.js holds the starting data.
  • When any page loads, this file copies the saved data from localStorage
    INTO those same arrays, before the page code runs.
  • It saves again after changes (and every 2 seconds, and when you leave
    the page), so the other pages never need to know about saving.

Only equipment and transactions are saved. Student examples come from the seed.
Account authentication is separate and handled by Supabase. */
import { equipment, students, transactions } from "./sample-data.js";

const SEED_VERSION = 1;
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

hydrate();
preserveBorrowerSnapshots();

// Keep saving without every page having to call save().
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
setInterval(save, 2000);