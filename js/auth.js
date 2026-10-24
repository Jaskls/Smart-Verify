import { getSupabase } from "./supabase.js";

export class ProfileUnavailableError extends Error {
  constructor() {
    super("No verified account profile was found. Confirm your school email and try again. If this continues, contact the project owner.");
    this.name = "ProfileUnavailableError";
  }
}

export async function getProfile(userId) {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id, full_name, student_no, role, pin_configured")
    .eq("id", userId)
    .single();
  if (error?.code === "PGRST116") {
    throw new ProfileUnavailableError();
  }
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
  location.replace("index.html");
}

export async function requireProfile(allowedRole) {
  let client;
  try {
    client = getSupabase();
  } catch (error) {
    return stopWithError(error);
  }
  let session;
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return stopWithError(error);
    session = data.session;
  } catch (error) {
    return stopWithError(error);
  }
  if (!session) {
    location.replace("index.html");
    return new Promise(() => {});
  }

  let profile;
  try {
    profile = await getProfile(session.user.id);
  } catch (profileError) {
    return stopWithError(profileError);
  }

  if (allowedRole && profile.role !== allowedRole) {
    location.replace(profile.role === "admin" ? "dashboard.html" : "student.html");
    return new Promise(() => {});
  }
  if (profile.role === "student" && !profile.pin_configured) {
    location.replace("index.html?setup-pin=1");
    return new Promise(() => {});
  }

  return profile;
}

function stopWithError(error) {
  document.body.replaceChildren();
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.style.cssText = "margin:2rem;font:16px system-ui";
  message.textContent = `Could not verify your account: ${error.message || error}`;
  document.body.appendChild(message);
  return new Promise(() => {});
}
