import { getSupabase } from "./supabase.js";

const LOCAL_QUEUE_KEY = "sv.qr-queue";

function queueQuery() {
  const supabase = getSupabase();
  return supabase.from("qr_sticker_queue");
}

export async function readStickerQueue() {
  const savedQueue = localStorage.getItem(LOCAL_QUEUE_KEY);
  if (savedQueue) {
    let localQueue;
    try {
      localQueue = JSON.parse(savedQueue);
    } catch (error) {
      throw new Error(`Could not import the previous local QR queue: ${error.message}`);
    }
    if (Array.isArray(localQueue) && localQueue.length) {
      await addStickersToQueue(localQueue);
      localStorage.removeItem(LOCAL_QUEUE_KEY);
    }
  }

  const { data, error } = await queueQuery()
    .select("code, label")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((sticker) => ({ tag: sticker.code, name: sticker.label }));
}

export async function addStickersToQueue(items) {
  if (!items.length) return;
  const rows = items.map((item) => ({
    code: item.tag,
    label: item.name,
    equipment_id: item.id?.startsWith("eq-") ? item.id : null,
  }));
  const { error } = await queueQuery().upsert(rows, { onConflict: "user_id,code" });
  if (error) throw error;
}

export async function addStickerToQueue(item) {
  return addStickersToQueue([item]);
}

export async function removeStickerFromQueue(code) {
  const { error } = await queueQuery().delete().eq("code", code);
  if (error) throw error;
}

export async function clearStickerQueue() {
  const { error } = await queueQuery().delete().neq("code", "");
  if (error) throw error;
}
