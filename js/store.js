import { getSupabase } from "./supabase.js";
import { categories, equipment, students, transactions } from "./sample-data.js";

const supabase = getSupabase();
const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
if (sessionError) throw sessionError;

export async function reloadData() {
  categories.splice(0);
  equipment.splice(0);
  students.splice(0);
  transactions.splice(0);

  if (!sessionData.session) return;
  const userId = sessionData.session.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return;
  const profileQuery = supabase
    .from("profiles")
    .select("id, full_name, student_no, role, school_email_verified, pin_configured")
    .eq("role", "student")
    .eq("school_email_verified", true)
    .eq("pin_configured", true);
  const studentQuery = profile.role === "admin"
    ? profileQuery
    : profileQuery.eq("id", userId);
  const [equipmentResult, loanResult, studentResult] = await Promise.all([
    supabase.from("equipment").select("*").order("name"),
    supabase.from("equipment_loans").select("*").order("borrowed_at", { ascending: false }),
    studentQuery,
  ]);
  for (const result of [equipmentResult, loanResult, studentResult]) {
    if (result.error) throw result.error;
  }

  equipment.splice(0, equipment.length, ...(equipmentResult.data ?? []).map((item) => ({
    id: item.id,
    tag: item.tag,
    name: item.name,
    category: item.category,
    location: item.location,
    total: item.total,
    available: item.available,
    condition: item.condition,
    components: item.components,
    photo: item.photo_url,
  })));
  categories.splice(0, categories.length, ...new Set(equipment.map((item) => item.category)));
  students.splice(0, students.length, ...(studentResult.data ?? []).map((student) => ({
    id: student.id,
    studentNo: student.student_no,
    name: student.full_name,
    course: "",
    year: "",
    email: "",
  })));
  transactions.splice(0, transactions.length, ...(loanResult.data ?? []).map((loan) => ({
    id: loan.id,
    studentId: loan.student_id,
    studentNameSnapshot: loan.student_name_snapshot,
    studentNoSnapshot: loan.student_no_snapshot,
    equipmentId: loan.equipment_id,
    quantity: loan.quantity,
    borrowedAt: loan.borrowed_at,
    dueAt: loan.due_at,
    returnedAt: loan.returned_at,
    checklistOut: loan.checklist_out,
    checklistIn: loan.checklist_in,
    missing: loan.missing,
    notes: loan.notes,
  })));
}

try {
  await reloadData();
} catch (error) {
  const alert = document.createElement("p");
  alert.setAttribute("role", "alert");
  alert.style.cssText = "margin:2rem;font:16px system-ui";
  alert.textContent = `Could not load shared Smart-Verify data: ${error.message || error}`;
  document.body.replaceChildren(alert);
  throw error;
}

export async function saveEquipment(item, photoFile = null) {
  let photoUrl = item.photo ?? null;
  if (photoFile) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(photoFile.type)) {
      throw new Error("Choose a JPG, PNG or WebP photo.");
    }
    const path = `${item.id}/photo`;
    const { error: uploadError } = await supabase.storage
      .from("equipment-photos")
      .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("equipment-photos").getPublicUrl(path);
    photoUrl = data.publicUrl;
  }

  const { error } = await supabase.from("equipment").upsert({
    id: item.id,
    tag: item.tag,
    name: item.name,
    category: item.category,
    location: item.location,
    total: item.total,
    available: item.available,
    condition: item.condition,
    components: item.components,
    photo_url: photoUrl,
  });
  if (error) throw error;
  return { ...item, photo: photoUrl };
}

export async function deleteEquipment(id) {
  const { error } = await supabase.from("equipment").delete().eq("id", id);
  if (error) throw error;
}
