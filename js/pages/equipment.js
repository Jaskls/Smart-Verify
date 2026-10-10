// Equipment inventory — search, filter, view, add, edit, delete.
// Stage 1: changes are kept in memory only. Stage 4 saves them to Supabase.
import { equipment, categories, transactions } from "../sample-data.js";
import {
  renderShell, getPreviewRole, escapeHtml, stockTag, conditionTag,
  initials, toast, openModal, closeModal,
} from "../app.js";

const role = getPreviewRole();
const isAdmin = role === "admin";
renderShell({ role, active: "equipment.html" });

if (!isAdmin) {
  document.querySelectorAll("[data-admin-only]").forEach((el) => el.remove());
  document.getElementById("page-intro").textContent =
    "See what's on the shelf before you ask to borrow it.";
}

// Elements -----------------------------------------------------------------------
const grid = document.getElementById("equip-grid");
const count = document.getElementById("result-count");
const search = document.getElementById("search");
const categoryFilter = document.getElementById("category-filter");
const stockFilter = document.getElementById("stock-filter");
const detailModal = document.getElementById("detail-modal");
const detailBody = document.getElementById("detail-body");
const formModal = document.getElementById("form-modal");
const form = document.getElementById("equip-form");
const formError = document.getElementById("form-error");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photo-preview");
const chips = document.getElementById("component-chips");
const componentInput = document.getElementById("f-component");

const categoryOptions = categories.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
categoryFilter.insertAdjacentHTML("beforeend", categoryOptions);
document.getElementById("f-category").innerHTML = categoryOptions;

let selectedId = null; // item open in the detail modal
let editingId = null; // item being edited (null = adding new)
let draftComponents = [];
let draftPhoto = null;

// Listing ------------------------------------------------------------------------
function stockLevel(item) {
  if (item.available === 0) return "out";
  if (item.available / item.total <= 0.2) return "low";
  return "available";
}

function render() {
  const q = search.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  const stock = stockFilter.value;

  const results = equipment.filter((item) => {
    const text = `${item.name} ${item.tag} ${item.location} ${item.category}`.toLowerCase();
    return (!q || text.includes(q))
      && (!cat || item.category === cat)
      && (!stock || stockLevel(item) === stock);
  });

  count.textContent = `${results.length} of ${equipment.length} items`;

  grid.innerHTML = results.length
    ? results.map((item) => `
        <button class="card equip-card" type="button" data-id="${item.id}">
          <div class="equip-photo">
            ${item.photo ? `<img src="${item.photo}" alt="">` : escapeHtml(initials(item.name))}
            ${stockTag(item)}
          </div>
          <div class="equip-info">
            <span class="code-tag" style="justify-self:start">${escapeHtml(item.tag)}</span>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="equip-meta">
              <span>${escapeHtml(item.category)}</span>
              <span><span class="qty">${item.available}</span> / ${item.total} available</span>
            </div>
          </div>
        </button>`).join("")
    : '<div class="card empty" style="grid-column:1/-1">No equipment matches your search.</div>';
}

[search, categoryFilter, stockFilter].forEach((el) => el.addEventListener("input", render));

grid.addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (card) showDetail(card.dataset.id);
});

// Detail -------------------------------------------------------------------------
function showDetail(id) {
  selectedId = id;
  const item = equipment.find((x) => x.id === id);
  const onLoan = transactions.filter((t) => t.equipmentId === id && !t.returnedAt)
    .reduce((sum, t) => sum + t.quantity, 0);

  document.getElementById("detail-title").textContent = item.name;
  detailBody.innerHTML = `
    <div class="detail-hero">
      <div class="equip-photo">${item.photo ? `<img src="${item.photo}" alt="${escapeHtml(item.name)}">` : escapeHtml(initials(item.name))}</div>
      <dl class="kv">
        <dt>Asset tag</dt><dd><span class="code-tag">${escapeHtml(item.tag)}</span></dd>
        <dt>Category</dt><dd>${escapeHtml(item.category)}</dd>
        <dt>Location</dt><dd>${escapeHtml(item.location || "—")}</dd>
        <dt>Condition</dt><dd>${conditionTag(item.condition)}</dd>
        <dt>On loan</dt><dd class="mono">${onLoan} unit${onLoan === 1 ? "" : "s"}</dd>
        <dt>Status</dt><dd>${stockTag(item)}</dd>
      </dl>
    </div>
    <div class="field">
      <span class="label">Available quantity</span>
      ${isAdmin ? `
        <div style="display:flex;align-items:center;gap:12px">
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="Decrease available">−</button>
            <output id="qty-out">${item.available}</output>
            <button type="button" data-step="1" aria-label="Increase available">+</button>
          </div>
          <span class="muted mono">of ${item.total} total</span>
        </div>`
      : `<span class="mono">${item.available} of ${item.total}</span>`}
    </div>
    <div class="field">
      <span class="label">Components (${item.components.length})</span>
      <ul class="list card" style="box-shadow:none">
        ${item.components.map((c) => `<li style="padding:8px 14px">${escapeHtml(c)}</li>`).join("") || '<li class="muted">No components listed.</li>'}
      </ul>
    </div>`;
  openModal(detailModal);
}

detailBody.addEventListener("click", (e) => {
  const step = e.target.closest("[data-step]");
  if (!step) return;
  const item = equipment.find((x) => x.id === selectedId);
  const next = item.available + Number(step.dataset.step);
  if (next < 0 || next > item.total) {
    toast(next < 0 ? "Available can't go below zero." : "Available can't exceed total quantity.", "error");
    return;
  }
  item.available = next;
  document.getElementById("qty-out").textContent = next;
  render();
});

// Add / edit form ------------------------------------------------------------------
function renderChips() {
  chips.innerHTML = draftComponents.map((c, i) => `
    <span class="chip">${escapeHtml(c)}<button type="button" data-remove="${i}" aria-label="Remove ${escapeHtml(c)}">×</button></span>`).join("");
}

function addComponent() {
  const value = componentInput.value.trim();
  if (!value) return;
  if (!draftComponents.includes(value)) draftComponents.push(value);
  componentInput.value = "";
  renderChips();
  componentInput.focus();
}

document.getElementById("add-component")?.addEventListener("click", addComponent);
componentInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addComponent(); }
});
chips.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  draftComponents.splice(Number(btn.dataset.remove), 1);
  renderChips();
});

// Photo preview (local only — the file isn't uploaded until Stage 4).
photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast("Please choose a photo under 5 MB.", "error");
    photoInput.value = "";
    return;
  }
  draftPhoto = URL.createObjectURL(file);
  photoPreview.innerHTML = `<img src="${draftPhoto}" alt="">`;
});

function openForm(item = null) {
  editingId = item?.id ?? null;
  form.reset();
  formError.textContent = "";
  document.getElementById("form-title").textContent = item ? "Edit equipment" : "Add equipment";
  draftComponents = item ? [...item.components] : [];
  draftPhoto = item?.photo ?? null;
  photoPreview.innerHTML = draftPhoto ? `<img src="${draftPhoto}" alt="">` : "—";

  if (item) {
    form.elements.name.value = item.name;
    form.tag.value = item.tag;
    form.category.value = item.category;
    form.location.value = item.location;
    form.total.value = item.total;
    form.available.value = item.available;
    form.condition.value = item.condition;
  } else {
    const next = equipment.length + 1;
    form.tag.value = `SV-EQ-${String(next).padStart(4, "0")}`;
  }
  renderChips();
  openModal(formModal);
  form.elements.name.focus();
}

document.getElementById("add-btn")?.addEventListener("click", () => openForm());
document.getElementById("edit-btn")?.addEventListener("click", () => {
  closeModal(detailModal);
  openForm(equipment.find((x) => x.id === selectedId));
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    name: form.elements.name.value.trim(),
    tag: form.tag.value.trim().toUpperCase(),
    category: form.category.value,
    location: form.location.value.trim(),
    total: Number(form.total.value),
    available: Number(form.available.value),
    condition: form.condition.value,
    components: [...draftComponents],
    photo: draftPhoto,
  };

  // Validation — the same rules will also be enforced in the database later.
  const tagTaken = equipment.some((x) => x.tag === data.tag && x.id !== editingId);
  let error = "";
  if (!data.name) error = "Please enter a name.";
  else if (!data.tag) error = "Please enter an asset tag.";
  else if (tagTaken) error = "That asset tag is already used by another item.";
  else if (!Number.isInteger(data.total) || data.total < 0) error = "Total quantity must be a whole number, 0 or more.";
  else if (!Number.isInteger(data.available) || data.available < 0 || data.available > data.total)
    error = "Available must be between 0 and the total quantity.";
  if (error) { formError.textContent = error; return; }

  if (editingId) {
    Object.assign(equipment.find((x) => x.id === editingId), data);
    toast(`Updated ${data.name} (preview only, not saved).`);
  } else {
    equipment.unshift({ id: `eq-${Date.now()}`, ...data });
    toast(`Added ${data.name} (preview only, not saved).`);
  }
  closeModal(formModal);
  render();
});

// Delete -------------------------------------------------------------------------
document.getElementById("delete-btn")?.addEventListener("click", () => {
  const item = equipment.find((x) => x.id === selectedId);
  const onLoan = transactions.some((t) => t.equipmentId === item.id && !t.returnedAt);
  if (onLoan) {
    toast("This item has units on loan. Process the returns before deleting it.", "error");
    return;
  }
  if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return;
  equipment.splice(equipment.indexOf(item), 1);
  closeModal(detailModal);
  toast(`Deleted ${item.name} (preview only).`);
  render();
});

render();
if (isAdmin && location.hash === "#add") openForm();
