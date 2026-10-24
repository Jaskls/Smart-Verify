// Sign-in page (Stage 1: interface only — no real authentication yet).
import { addThemeToggle, setPreviewRole, toast } from "../app.js";

addThemeToggle(document.querySelector(".auth-panel"));
const tabs = document.querySelectorAll("[data-role]");
const label = document.getElementById("identifier-label");
const input = document.getElementById("identifier");
const form = document.getElementById("signin-form");

// Switch between Student and Administrator sign-in.
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    const isAdmin = tab.dataset.role === "admin";
    label.textContent = isAdmin ? "Staff email" : "Student number or school email";
    input.placeholder = isAdmin ? "name@school.edu" : "2024-00117";
  });
});

// Basic form check. Stage 3 sends these details to Supabase Auth instead.
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!input.value.trim() || !form.password.value) {
    toast("Please enter your ID and password.", "error");
    return;
  }
  toast("Sign-in connects in Stage 3. Use a preview link below for now.", "error");
});

// Remember which preview the user picked so the sidebar matches.
document.querySelectorAll("[data-preview]").forEach((link) => {
  link.addEventListener("click", () => setPreviewRole(link.dataset.preview));
});
