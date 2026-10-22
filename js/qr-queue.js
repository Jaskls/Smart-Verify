const QUEUE_KEY = "sv.qr-queue";

export function readStickerQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(queue) ? queue : [];
  } catch (error) {
    console.warn("Could not read the QR sticker queue.", error);
    return [];
  }
}

export function addStickerToQueue(item) {
  const queue = readStickerQueue().filter((sticker) => sticker.tag !== item.tag);
  queue.push({ id: item.id, tag: item.tag, name: item.name });
  writeStickerQueue(queue);
}

export function removeStickerFromQueue(tag) {
  writeStickerQueue(readStickerQueue().filter((sticker) => sticker.tag !== tag));
}

export function clearStickerQueue() {
  writeStickerQueue([]);
}

function writeStickerQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn("Could not save the QR sticker queue.", error);
    throw error;
  }
}
