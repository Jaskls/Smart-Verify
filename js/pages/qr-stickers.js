import { equipment } from "../sample-data.js";
import { getPreviewRole, renderShell, escapeHtml, toast } from "../app.js";
import { clearStickerQueue, readStickerQueue, removeStickerFromQueue } from "../qr-queue.js";

const role = getPreviewRole();
if (role !== "admin") location.replace("equipment.html?view=student");
renderShell({ role: "admin", active: "qr-stickers.html" });

const pageContainer = document.getElementById("sticker-pages");
const count = document.getElementById("queue-count");
const printButton = document.getElementById("print-stickers");
const clearButton = document.getElementById("clear-queue");
const singleId = new URLSearchParams(location.search).get("item");

if (singleId) {
  document.getElementById("sticker-title").textContent = "Print QR sticker";
  document.getElementById("sticker-description").textContent = "Print a sticker for this equipment item.";
  printButton.textContent = "Print QR Sticker";
  clearButton.hidden = true;
}

function getStickers() {
  if (singleId) {
    const item = equipment.find((equipmentItem) => equipmentItem.id === singleId);
    return item ? [{ id: item.id, tag: item.tag, name: item.name }] : [];
  }
  return readStickerQueue();
}

function render() {
  const stickers = getStickers();
  count.textContent = singleId
    ? stickers.length ? "1 sticker" : "Equipment item not found."
    : `${stickers.length} sticker${stickers.length === 1 ? "" : "s"} in the queue`;

  if (!stickers.length) {
    pageContainer.innerHTML = `<section class="card empty sticker-empty">${
      singleId ? "Equipment item not found." : "Your sticker queue is empty. Add equipment from the inventory to get started."
    }</section>`;
    return;
  }

  if (typeof window.QRCode !== "function") {
    pageContainer.innerHTML = '<section class="card empty sticker-empty">The QR code generator could not load. Check your internet connection and reload this page.</section>';
    return;
  }

  pageContainer.innerHTML = Array.from({ length: Math.ceil(stickers.length / 12) }, (_, pageIndex) => {
    const pageStickers = stickers.slice(pageIndex * 12, (pageIndex + 1) * 12);
    return `<section class="sticker-page">${pageStickers.map((sticker) => `
      <article class="sticker">
        <h2 class="sticker-name">${escapeHtml(sticker.name)}</h2>
        <div class="sticker-qr" data-qr="${escapeHtml(sticker.tag)}" role="img" aria-label="QR code for ${escapeHtml(sticker.tag)}"></div>
        <p class="sticker-tag">${escapeHtml(sticker.tag)}</p>
        ${singleId ? "" : `<button class="btn btn-sm sticker-remove screen-only" type="button" data-remove-tag="${escapeHtml(sticker.tag)}" aria-label="Remove ${escapeHtml(sticker.name)} from queue">Remove from Queue</button>`}
      </article>`).join("")}</section>`;
  }).join("");

  pageContainer.querySelectorAll("[data-qr]").forEach((qr) => {
    new window.QRCode(qr, {
      text: qr.dataset.qr,
      width: 150,
      height: 150,
      colorDark: "#191a23",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  });
}

printButton.addEventListener("click", () => window.print());

clearButton.addEventListener("click", () => {
  if (!confirm("Clear all stickers from the print queue?")) return;
  try {
    clearStickerQueue();
    render();
  } catch {
    toast("Could not clear the QR sticker queue.", "error");
  }
});

pageContainer.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-tag]");
  if (!removeButton) return;
  try {
    removeStickerFromQueue(removeButton.dataset.removeTag);
    render();
  } catch {
    toast("Could not remove the sticker from the queue.", "error");
  }
});

render();
