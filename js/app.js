/* [app.js: shared helpers used by every page]

• renderShell()  draws the sidebar + preview banner so each HTML page stays short
• icon()         small inline SVG icon set
• date + status helpers for loans
• toast() and modal helpers */

import { admins, students, previewStudentId } from "./sample-data.js";
import "./store.js"; // loads saved data into the sample-data arrays (see store.js)

const THEME_KEY = "sv-theme";
const themePreference = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll(".theme-toggle").forEach(updateThemeToggle);
}

function updateThemeToggle(button) {
  const isDark = document.documentElement.dataset.theme === "dark";
  button.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  button.setAttribute("aria-pressed", String(isDark));
  button.innerHTML = `${icon(isDark ? "sun" : "moon")}<span>${isDark ? "Light" : "Dark"} mode</span>`;
}

const savedTheme = localStorage.getItem(THEME_KEY);
applyTheme(savedTheme === "light" || savedTheme === "dark"
  ? savedTheme
  : themePreference.matches ? "dark" : "light");

themePreference.addEventListener("change", (event) => {
  if (!localStorage.getItem(THEME_KEY)) applyTheme(event.matches ? "dark" : "light");
});

window.addEventListener("storage", (event) => {
  if (event.key === THEME_KEY) {
    applyTheme(event.newValue === "dark" ? "dark" : event.newValue === "light" ? "light" : themePreference.matches ? "dark" : "light");
  }
});

export function addThemeToggle(container) {
  if (!container || container.querySelector(".theme-toggle")) return;
  const button = document.createElement("button");
  button.className = "btn theme-toggle";
  button.type = "button";
  updateThemeToggle(button);
  button.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  });
  container.appendChild(button);
}

// Icons 
const ICONS = {
  logo: '<path d="M8 5H5v3m11-3h3v3M5 16v3h3m11-3v3h-3"/><path d="m8.5 12.2 2.3 2.3 4.8-5" stroke-width="2.6"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  swap: '<path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  alert: '<path d="M12 3l9.5 17H2.5L12 3z"/><path d="M12 10v4M12 17.5v.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  return: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

// Navigation 
const NAV = {
  admin: [
    { href: "dashboard.html", label: "Dashboard", icon: "dashboard" },
    { href: "equipment.html", label: "Equipment", icon: "box" },
    { href: "qr-stickers.html", label: "QR Stickers", icon: "qr" },
    { href: "borrow.html", label: "Borrow & Return", icon: "swap" },
    { href: "history.html", label: "Transactions", icon: "history" },
  ],
  student: [
    { href: "student.html", label: "My Borrowings", icon: "user" },
    { href: "equipment.html?view=student", label: "Browse Equipment", icon: "box" },
  ],
};
/* In Stage 1 the role is just remembered in the browser tab so the preview
can switch between views. Stage 3 replaces this with real Supabase Auth. */
export function getPreviewRole() {
  const fromUrl = new URLSearchParams(location.search).get("view");
  if (fromUrl === "student") return "student";
  return sessionStorage.getItem("sv-preview-role") || "admin";
}

export function setPreviewRole(role) {
  sessionStorage.setItem("sv-preview-role", role);
}

export function initials(name) {
  return name
    .replace(/^(Prof\.|Dr\.)\s*/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function renderShell({ role = "admin", active }) {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  addThemeToggle(document.querySelector(".page-head"));

  const person = role === "student"
    ? { name: students.find((s) => s.id === previewStudentId).name, sub: "Student" }
    : { name: admins[0].name, sub: admins[0].role };

  const links = NAV[role]
    .map((item) => `
      <a href="${item.href}" ${item.href.startsWith(active) ? 'aria-current="page"' : ""}>
        ${icon(item.icon)}<span>${item.label}</span>
      </a>`)
    .join("");

  sidebar.innerHTML = `
    <div class="sidebar-head">
      <a class="brand" href="${role === "student" ? "student.html" : "dashboard.html"}">
        <span class="brand-mark">${icon("logo")}</span>
        <span class="brand-name">Smart<span>-Verify</span></span>
      </a>
      <button class="sidebar-close icon-btn" type="button" aria-label="Close navigation menu">${icon("close")}</button>
    </div>
    <nav class="nav" aria-label="Main">
      <div class="nav-label">${role === "student" ? "Student" : "Administrator"}</div>
      ${links}
    </nav>
    <div class="sidebar-foot">
      <div class="avatar">${initials(person.name)}</div>
      <div class="who"><strong>${escapeHtml(person.name)}</strong><span>${person.sub}</span></div>
      <a href="index.html">Sign out</a>
    </div>`;

  const menuButtons = document.querySelectorAll(".menu-toggle");
  const setMenuOpen = (isOpen) => {
    sidebar.classList.toggle("open", isOpen);
    menuButtons.forEach((btn) => {
      btn.setAttribute("aria-controls", sidebar.id);
      btn.setAttribute("aria-expanded", String(isOpen));
      btn.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
    });
  };

  // Mobile menu toggle
  menuButtons.forEach((btn) => {
    btn.innerHTML = icon("menu");
    btn.setAttribute("aria-controls", sidebar.id);
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setMenuOpen(!sidebar.classList.contains("open"));
    });
  });
  sidebar.querySelector(".sidebar-close").addEventListener("click", () => setMenuOpen(false));
  document.addEventListener("click", (e) => {
    if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !e.target.closest(".menu-toggle")) {
      setMenuOpen(false);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("open")) setMenuOpen(false);
  });
}

// Text safety: Always escape user-typed text before putting it inside innerHTML.
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Dates 
export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Whole days between today and a date (negative = in the past).
export function daysUntil(iso) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(iso); end.setHours(0, 0, 0, 0);
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

export function toDateInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Loan status
export function loanStatus(tx) {
  if (tx.returnedAt) return "returned";
  return daysUntil(tx.dueAt) < 0 ? "overdue" : "active";
}

export function statusTag(tx) {
  const status = loanStatus(tx);
  if (status === "returned") {
    const complete = tx.checklistIn && tx.checklistIn.length === tx.checklistOut.length;
    return complete
      ? '<span class="tag green">Returned</span>'
      : '<span class="tag amber">Returned · incomplete</span>';
  }
  // An incomplete return keeps the loan open; show what is still missing.
  const missingTag = tx.missing && tx.missing.length
    ? ` <span class="tag amber">Missing ${tx.missing.length}</span>` : "";
  if (status === "overdue") {
    const d = Math.abs(daysUntil(tx.dueAt));
    return `<span class="tag red">Overdue ${d}d</span>${missingTag}`;
  }
  const d = daysUntil(tx.dueAt);
  if (d === 0) return `<span class="tag amber">Due today</span>${missingTag}`;
  return `<span class="tag blue">Due in ${d}d</span>${missingTag}`;
}

export function stockTag(item) {
  if (item.available === 0) return '<span class="tag red">Out of stock</span>';
  if (item.available / item.total <= 0.2) return '<span class="tag amber">Low stock</span>';
  return '<span class="tag green">Available</span>';
}

export function conditionTag(condition) {
  const cls = condition === "Good" ? "green" : condition === "Fair" ? "amber" : "red";
  return `<span class="tag ${cls}">${escapeHtml(condition)}</span>`;
}

// Equipment thumbnail: photo if present, otherwise initials.
export function equipmentThumb(item) {
  return item.photo
    ? `<img src="${item.photo}" alt="">`
    : escapeHtml(initials(item.name));
}

// Toasts
export function toast(message, type = "success") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// Modals (native <dialog>)
export function openModal(dialog) {
  dialog.showModal();
}

export function closeModal(dialog) {
  dialog.close();
}

// Close any dialog when its [data-close] button or backdrop is clicked.
document.addEventListener("click", (e) => {
  const closer = e.target.closest("[data-close]");
  if (closer) closer.closest("dialog")?.close();
  if (e.target.tagName === "DIALOG") e.target.close();
});