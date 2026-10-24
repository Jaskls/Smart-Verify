import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://kwbtqqwpyepurfkhrebr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pQpY0LaZ7BckrXWGTFa5lw_LX4cXC0g";

export const isSupabaseConfigured =
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE_PUBLISHABLE_KEY");

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

export function getSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add your project URL and publishable key in js/supabase.js.");
  }
  return supabase;
}
