// Equipment inventory — search, filter, view, add, edit, delete.
// Stage 1: changes are kept in memory only. Stage 4 saves them to Supabase.
import { equipment, categories, transactions } from "../sample-data.js";
import { addStickerToQueue, removeStickerFromQueue } from "../qr-queue.js";
import {
  renderShell, getPreviewRole, photoImg, escapeHtml, stockTag, conditionTag,
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
const formCategory = document.getElementById("f-category");
const customCategoryField = document.getElementById("custom-category-field");
const customCategoryInput = document.getElementById("f-custom-category");
const qrQueueField = document.getElementById("qr-queue-field");
const addToQrQueueInput = document.getElementById("add-to-qr-queue");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photo-preview");
const chips = document.getElementById("component-chips");
const componentInput = document.getElementById("f-component");

const OTHER_CATEGORY = "__other__";

function getKnownCategories() {
  return [...new Set([...categories, ...equipment.map((item) => item.category).filter(Boolean)])];
}

function refreshCategoryOptions() {
  const selected = categoryFilter.value;
  categoryFilter.innerHTML = `<option value="">All categories</option>${getKnownCategories()
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  categoryFilter.value = selected;

  formCategory.innerHTML = `<option value="">Choose a category</option>${getKnownCategories()
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
    <option value="${OTHER_CATEGORY}">Other</option>`;
}

refreshCategoryOptions();

function updateCustomCategoryVisibility() {
  const isOther = formCategory.value === OTHER_CATEGORY;
  customCategoryField.hidden = !isOther;
  customCategoryInput.required = isOther;
  if (!isOther) customCategoryInput.value = "";
}

formCategory.addEventListener("change", updateCustomCategoryVisibility);

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
  refreshCategoryOptions();
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
        <article class="card equip-card">
          <button class="equip-card-open" type="button" data-id="${escapeHtml(item.id)}">
            <div class="equip-photo">
              ${photoImg(item)}
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
          </button>
          ${isAdmin ? `<div class="equip-card-actions"><button class="btn btn-sm" type="button" data-print-id="${escapeHtml(item.id)}">Print QR sticker</button></div>` : ""}
        </article>`).join("")
    : '<div class="card empty" style="grid-column:1/-1">No equipment matches your search.</div>';
}

[search, categoryFilter, stockFilter].forEach((el) => el.addEventListener("input", render));

grid.addEventListener("click", (e) => {
  const printButton = e.target.closest("[data-print-id]");
  if (printButton) {
    printSticker(printButton.dataset.printId);
    return;
  }
  const card = e.target.closest("[data-id]");
  if (card) showDetail(card.dataset.id);
});

function printSticker(id) {
  const url = `qr-stickers.html?item=${encodeURIComponent(id)}`;
  const printWindow = window.open(url, "_blank");
  if (!printWindow) location.assign(url);
}

// Detail -------------------------------------------------------------------------
function showDetail(id) {
  selectedId = id;
  const item = equipment.find((x) => x.id === id);
  const onLoan = transactions.filter((t) => t.equipmentId === id && !t.returnedAt)
    .reduce((sum, t) => sum + t.quantity, 0);

  document.getElementById("detail-title").textContent = item.name;
  const printButton = document.getElementById("print-detail-qr");
  if (printButton) printButton.dataset.printId = item.id;
  detailBody.innerHTML = `
    <div class="detail-hero">
      <div class="equip-photo">${photoImg(item, item.name)}</div>
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
    </div>
    ${isAdmin ? `<div class="field">
      <span class="label">QR code (scan this to find the tool)</span>
      <div style="display:flex;align-items:center;gap:14px">
        <div id="detail-qr" style="background:#fff;padding:8px;border:2px solid var(--ink);border-radius:10px"></div>
        <span class="code-tag">${escapeHtml(item.tag)}</span>
      </div>
    </div>` : ""}`;
  const qrBox = document.getElementById("detail-qr");
  if (qrBox && typeof window.QRCode === "function") {
    new window.QRCode(qrBox, { text: item.tag, width: 110, height: 110, colorDark: "#191a23", colorLight: "#ffffff" });
  } else if (qrBox) qrBox.textContent = "QR preview needs an internet connection.";
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

document.getElementById("print-detail-qr")?.addEventListener("click", (e) => {
  printSticker(e.currentTarget.dataset.printId);
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

// Photo upload: shrink the picture and keep it as text (data URL) so it survives a page reload.
function resizePhoto(file, max = 480) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = url;
  });
}
photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toast("Please choose a photo under 10 MB.", "error");
    photoInput.value = "";
    return;
  }
  try {
    draftPhoto = await resizePhoto(file);
    photoPreview.innerHTML = `<img src="${draftPhoto}" alt="">`;
  } catch (err) { toast(err.message, "error"); }
});

function openForm(item = null) {
  editingId = item?.id ?? null;
  form.reset();
  formError.textContent = "";
  qrQueueField.hidden = Boolean(item);
  addToQrQueueInput.checked = !item; // new tools get a sticker queued by default
  refreshCategoryOptions();
  formCategory.value = item?.category ?? "";
  customCategoryInput.value = "";
  updateCustomCategoryVisibility();
  document.getElementById("form-title").textContent = item ? "Edit equipment" : "Add equipment";
  draftComponents = item ? [...item.components] : [];
  draftPhoto = item?.photo ?? null;
  photoPreview.innerHTML = item ? photoImg({ ...item, photo: draftPhoto }) : "—";

  if (item) {
    form.elements.name.value = item.name;
    form.tag.value = item.tag;
    form.category.value = item.category;
    form.location.value = item.location;
    form.total.value = item.total;
    form.available.value = item.available;
    form.condition.value = item.condition;
  } else {
    // Next free code: highest existing SV-EQ number + 1, so a code is never reused after a delete.
    const highest = Math.max(0, ...equipment.map((x) => Number((/^SV-EQ-(\d+)$/i.exec(x.tag) || [])[1]) || 0));
    form.tag.value = `SV-EQ-${String(highest + 1).padStart(4, "0")}`;
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

let newlyAddedId = null;
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    name: form.elements.name.value.trim(),
    tag: form.tag.value.trim().toUpperCase(),
    category: formCategory.value === OTHER_CATEGORY ? customCategoryInput.value.trim() : formCategory.value,
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
  else if (!data.category) error = "Please choose or enter a category.";
  else if (tagTaken) error = "That asset tag is already used by another item.";
  else if (!Number.isInteger(data.total) || data.total < 0) error = "Total quantity must be a whole number, 0 or more.";
  else if (!Number.isInteger(data.available) || data.available < 0 || data.available > data.total)
    error = "Available must be between 0 and the total quantity.";
  if (error) { formError.textContent = error; return; }

  if (editingId) {
    const existing = equipment.find((x) => x.id === editingId);
    const oldTag = existing.tag;
    Object.assign(existing, data);
    if (oldTag !== data.tag) {
      // The old sticker no longer matches this tool, so take it out of the print queue.
      try { removeStickerFromQueue(oldTag); addStickerToQueue(existing); } catch { /* queue is optional */ }
      toast(`Updated ${data.name}. Its code changed to ${data.tag}, so print a new sticker.`);
    } else toast(`Updated ${data.name}.`);
  } else {
    const newItem = { id: `eq-${Date.now()}`, ...data };
    equipment.unshift(newItem);
    try {
      addStickerToQueue(newItem); // every new tool gets its QR sticker queued automatically
      toast(`${data.name} added with code ${data.tag}. Its QR is ready to print.`);
    } catch {
      toast("Equipment was added, but the QR print queue could not be saved.", "error");
    }
    newlyAddedId = newItem.id;
  }
  closeModal(formModal);
  render();
  if (newlyAddedId) { showDetail(newlyAddedId); newlyAddedId = null; } // show the new tool with its QR
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
  try { removeStickerFromQueue(item.tag); } catch { /* queue is optional */ }
  closeModal(detailModal);
  toast(`Deleted ${item.name}.`);
  render();
});

render();
if (isAdmin && location.hash === "#add") openForm();
