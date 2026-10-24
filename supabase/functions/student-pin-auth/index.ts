import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
}
const rateLimitSecret = Deno.env.get("PIN_RATE_LIMIT_SECRET");
const allowedOrigins = (Deno.env.get("APP_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const encoder = new TextEncoder();
const pinIterations = 600_000;
const genericLoginFailure = "Student ID or PIN is incorrect.";
const predictablePins = new Set([
  "0123", "1234", "2345", "3456", "4567", "5678", "6789",
  "9876", "8765", "7654", "6543", "5432", "4321", "3210",
  "1212", "2121", "2580",
]);

function isKldEmail(email: string | undefined | null) {
  return typeof email === "string" && /^[^@]+@kld\.edu\.ph$/i.test(email.trim());
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function response(
  body: Record<string, unknown>,
  status: number,
  origin: string,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      "access-control-allow-methods": "POST, OPTIONS",
      vary: "Origin",
    },
  });
}

function base64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function derivePinHash(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: pinIterations, hash: "SHA-256" },
    key,
    256,
  ));
}

async function hashPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(pin, salt);
  return `pbkdf2-sha256$${pinIterations}$${base64(salt)}$${base64(hash)}`;
}

async function verifyPin(pin: string, storedHash: string | undefined) {
  const parts = storedHash?.split("$") ?? [];
  const validRecord = parts.length === 4 &&
    parts[0] === "pbkdf2-sha256" &&
    Number(parts[1]) >= 100_000 &&
    Number(parts[1]) <= pinIterations;
  const salt = validRecord ? fromBase64(parts[2]) : new Uint8Array(16);
  const expected = validRecord ? fromBase64(parts[3]) : new Uint8Array(32);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const actual = new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: validRecord ? Number(parts[1]) : pinIterations,
      hash: "SHA-256",
    },
    key,
    256,
  ));
  let difference = validRecord ? actual.length ^ expected.length : 1;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ (expected[index] ?? 0);
  }
  return validRecord && difference === 0;
}

async function rateBucket(value: string) {
  if (!rateLimitSecret) throw new Error("PIN_RATE_LIMIT_SECRET is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(rateLimitSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function pinAttemptAllowed(ipAddress: string, studentId: string, recordFailure: boolean) {
  const { data, error } = await admin.rpc("consume_student_pin_login", {
    p_ip_bucket: await rateBucket(`ip:${ipAddress}`),
    p_student_bucket: await rateBucket(`student:${studentId.toLowerCase()}`),
    p_record_failure: recordFailure,
  });
  if (error) throw error;
  return data === true;
}

async function setStudentPin(body: Record<string, unknown>, request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!accessToken) return { status: 401, body: { error: "Sign in with your school account before setting a PIN." } };
  if (!/^\d{4}$/.test(pin)) return { status: 400, body: { error: "PIN must be exactly four digits." } };
  if (/^(\d)\1{3}$/.test(pin) || predictablePins.has(pin)) {
    return { status: 400, body: { error: "Choose a less predictable 4-digit PIN." } };
  }

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (
    authError ||
    !authData.user?.email_confirmed_at ||
    !isKldEmail(authData.user.email)
  ) {
    return { status: 401, body: { error: "Your confirmed school account is required to set a PIN." } };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, student_no, role, school_email_verified")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (
    !profile ||
    profile.role !== "student" ||
    !profile.school_email_verified ||
    !profile.student_no
  ) {
    return {
      status: 403,
      body: {
        error: "Your student profile is not ready for PIN setup. Confirm your email, name, and Student ID were entered, then ask the project owner to run the latest supabase-setup.sql. Student IDs must be unique; if yours is already linked to another account, the project owner must resolve that conflict. The app cannot verify who owns a Student ID.",
      },
    };
  }

  const { error: upsertError } = await admin
    .from("student_pin_credentials")
    .upsert({
      student_no: profile.student_no,
      auth_user_id: authData.user.id,
      pin_hash: await hashPin(pin),
      updated_at: new Date().toISOString(),
    }, { onConflict: "student_no" });
  if (upsertError) throw upsertError;

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({ pin_configured: true })
    .eq("id", authData.user.id);
  if (profileUpdateError) throw profileUpdateError;

  return { status: 200, body: { ok: true } };
}

async function requireStaff(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) return null;
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (error) throw error;
  return profile?.role === "admin" ? authData.user : null;
}

async function lookupStudentForStaff(body: Record<string, unknown>, request: Request) {
  const staff = await requireStaff(request);
  if (!staff) return { status: 403, body: { error: "Staff authorization is required." } };

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length > 120) {
    return { status: 400, body: { error: "Enter a Student ID or name to search." } };
  }

  const { data: exact, error: exactError } = await admin
    .from("profiles")
    .select("id, full_name, student_no, school_email_verified, pin_configured")
    .eq("student_no", query)
    .eq("role", "student")
    .maybeSingle();
  if (exactError) throw exactError;
  if (exact?.school_email_verified && exact.pin_configured) {
    return {
      status: 200,
      body: {
        student: {
          id: exact.id,
          name: exact.full_name,
          studentNo: exact.student_no,
        },
      },
    };
  }

  const escapedQuery = query.replace(/[\\%_]/g, "\\$&");
  const { data: matches, error: searchError } = await admin
    .from("profiles")
    .select("id, full_name, student_no, school_email_verified, pin_configured")
    .eq("role", "student")
    .eq("school_email_verified", true)
    .eq("pin_configured", true)
    .ilike("full_name", `%${escapedQuery}%`)
    .limit(2);
  if (searchError) throw searchError;
  if ((matches?.length ?? 0) > 1) {
    return { status: 409, body: { error: "More than one student matches that name. Search using the exact Student ID." } };
  }
  const match = matches?.[0];
  if (!match) return { status: 404, body: { error: "No verified student account found. Check the Student ID or name." } };
  return {
    status: 200,
    body: {
      student: {
        id: match.id,
        name: match.full_name,
        studentNo: match.student_no,
      },
    },
  };
}

async function verifyStudentPinForStaff(body: Record<string, unknown>, request: Request) {
  const staff = await requireStaff(request);
  if (!staff) return { status: 403, body: { error: "Staff authorization is required." } };
  const studentId = typeof body.student_no === "string" ? body.student_no.trim() : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!studentId || studentId.length > 80) {
    return { status: 401, body: { error: genericLoginFailure } };
  }
  if (!rateLimitSecret) throw new Error("PIN_RATE_LIMIT_SECRET is not configured.");

  const ipAddress = request.headers.get("cf-connecting-ip") ?? "edge-ip-unavailable";
  if (!await pinAttemptAllowed(ipAddress, studentId, false)) {
    return { status: 429, body: { error: "Too many attempts. Wait 15 minutes and try again." } };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, student_no, school_email_verified, pin_configured")
    .eq("student_no", studentId)
    .eq("role", "student")
    .maybeSingle();
  if (profileError) throw profileError;

  let storedHash: string | undefined;
  if (profile?.school_email_verified && profile.pin_configured) {
    const { data: credential, error: credentialError } = await admin
      .from("student_pin_credentials")
      .select("pin_hash")
      .eq("student_no", profile.student_no)
      .eq("auth_user_id", profile.id)
      .maybeSingle();
    if (credentialError) throw credentialError;
    storedHash = credential?.pin_hash;
  }
  const pinMatches = await verifyPin(/^\d{4}$/.test(pin) ? pin : "0000", storedHash);
  let valid = Boolean(profile?.school_email_verified && profile.pin_configured && pinMatches);
  if (valid && profile) {
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(profile.id);
    valid = !authError && Boolean(
      authData.user?.email_confirmed_at && isKldEmail(authData.user.email)
    );
  }
  if (!valid) {
    if (!await pinAttemptAllowed(ipAddress, studentId, true)) {
      return { status: 429, body: { error: "Too many attempts. Wait 15 minutes and try again." } };
    }
    return { status: 401, body: { error: genericLoginFailure } };
  }
  return { status: 200, body: { ok: true } };
}

async function loginWithStudentPin(body: Record<string, unknown>, request: Request) {
  const studentId = typeof body.student_id === "string" ? body.student_id.trim() : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  const ipAddress = request.headers.get("cf-connecting-ip") ?? "edge-ip-unavailable";

  if (!rateLimitSecret) throw new Error("PIN_RATE_LIMIT_SECRET is not configured.");
  if (!studentId || studentId.length > 80) {
    return { status: 401, body: { error: genericLoginFailure } };
  }

  if (!await pinAttemptAllowed(ipAddress, studentId, false)) {
    return { status: 429, body: { error: "Too many attempts. Wait 15 minutes and try again." } };
  }

  const validPinFormat = /^\d{4}$/.test(pin);
  const normalizedPin = validPinFormat ? pin : "0000";
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, school_email_verified, pin_configured, student_no")
    .eq("student_no", studentId)
    .eq("role", "student")
    .maybeSingle();
  if (profileError) throw profileError;

  let storedHash: string | undefined;
  if (profile?.id) {
    const { data: credential, error: credentialError } = await admin
      .from("student_pin_credentials")
      .select("pin_hash, auth_user_id")
      .eq("student_no", profile.student_no)
      .eq("auth_user_id", profile.id)
      .maybeSingle();
    if (credentialError) throw credentialError;
    storedHash = credential?.pin_hash;
  }

  const pinMatches = await verifyPin(normalizedPin, storedHash);
  let valid = Boolean(
    validPinFormat &&
    profile?.role === "student" &&
    profile.school_email_verified &&
    profile.pin_configured &&
    storedHash &&
    pinMatches
  );
  let verifiedEmail: string | null = null;
  if (valid && profile) {
    const { data: authData, error: userError } = await admin.auth.admin.getUserById(profile.id);
    valid = Boolean(
      !userError &&
      authData.user?.email_confirmed_at &&
      isKldEmail(authData.user.email)
    );
    if (valid) verifiedEmail = authData.user.email ?? null;
  }
  if (!valid || !verifiedEmail) {
    if (!await pinAttemptAllowed(ipAddress, studentId, true)) {
      return { status: 429, body: { error: "Too many attempts. Wait 15 minutes and try again." } };
    }
    return { status: 401, body: { error: genericLoginFailure } };
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: verifiedEmail,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) throw linkError ?? new Error("Supabase did not return a one-time login token.");

  return { status: 200, body: { token_hash: tokenHash } };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigins.includes(origin)) {
    return new Response("Origin is not allowed.", { status: 403 });
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
        "access-control-allow-methods": "POST, OPTIONS",
        vary: "Origin",
      },
    });
  }
  if (request.method !== "POST") {
    return response({ error: "Method not allowed." }, 405, origin);
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response({ error: "Invalid request." }, 400, origin);
    }
    const result = body.action === "set_pin"
      ? await setStudentPin(body, request)
      : body.action === "lookup_student"
      ? await lookupStudentForStaff(body, request)
      : body.action === "verify_student_pin"
      ? await verifyStudentPinForStaff(body, request)
      : body.action === "login"
      ? await loginWithStudentPin(body, request)
      : { status: 400, body: { error: "Invalid request." } };
    return response(result.body, result.status, origin);
  } catch (error) {
    console.error("Student PIN authentication failed:", error);
    return response({ error: "Authentication service is temporarily unavailable." }, 500, origin);
  }
});
