import { equipment } from "../sample-data.js";
import { renderShell, escapeHtml, toast } from "../app.js";
import { requireProfile } from "../auth.js";
import { addStickerToQueue, addStickersToQueue, clearStickerQueue, readStickerQueue, removeStickerFromQueue } from "../qr-queue.js";

const profile = await requireProfile("admin");
renderShell({ profile, active: "qr-stickers.html" });

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

async function getStickers() {
  if (singleId) {
    const item = equipment.find((equipmentItem) => equipmentItem.id === singleId);
    return item ? [{ id: item.id, tag: item.tag, name: item.name }] : [];
  }
  return await readStickerQueue();
}

async function render() {
  let stickers;
  try {
    stickers = await getStickers();
  } catch (error) {
    pageContainer.innerHTML = `<section class="card empty sticker-empty">Could not load the saved QR queue: ${escapeHtml(error.message)}</section>`;
    count.textContent = "Queue unavailable";
    return;
  }
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

clearButton.addEventListener("click", async () => {
  if (!confirm("Clear all stickers from the print queue?")) return;
  try {
    await clearStickerQueue();
    await render();
  } catch (error) {
    toast(`Could not clear the QR sticker queue: ${error.message}`, "error");
  }
});

pageContainer.addEventListener("click", async (event) => {
  const removeButton = event.target.closest("[data-remove-tag]");
  if (!removeButton) return;
  try {
    await removeStickerFromQueue(removeButton.dataset.removeTag);
    await render();
  } catch (error) {
    toast(`Could not remove the sticker from the queue: ${error.message}`, "error");
  }
});

document.getElementById("queue-all").addEventListener("click", async () => {
  try {
    await addStickersToQueue(equipment);
    await render();
    toast(`${equipment.length} stickers are ready to print.`);
  } catch (error) {
    toast(`Could not fill the sticker queue: ${error.message}`, "error");
  }
});

document.getElementById("qr-make").addEventListener("click", async () => {
  const codeInput = document.getElementById("qr-code-text");
  const labelInput = document.getElementById("qr-label-text");
  const code = codeInput.value.trim();
  const label = labelInput.value.trim();
  if (!code) { toast("Type the code first.", "error"); return; }
  try {
    await addStickerToQueue({ id: `custom-${crypto.randomUUID()}`, tag: code, name: label || code });
    await render();
    codeInput.value = "";
    labelInput.value = "";
    toast(`QR for ${code} is in the queue. Scroll down to print.`);
  } catch (error) {
    toast(`Could not save that QR: ${error.message}`, "error");
  }
});

await render();
