import { addThemeToggle } from "../app.js";
import { getProfile, ProfileUnavailableError } from "../auth.js";
import { isSupabaseConfigured, supabase } from "../supabase.js";

addThemeToggle(document.querySelector(".auth-panel"));

const form = document.getElementById("signin-form");
const modeTabs = document.querySelectorAll("[data-role-tab]");
const modeLinks = document.querySelectorAll("[data-mode]");
const modeFields = document.querySelectorAll("[data-mode-field]");
const submitButton = document.getElementById("submit-button");
const status = document.getElementById("auth-status");
const authEyebrow = document.getElementById("auth-eyebrow");
const authTitle = document.getElementById("auth-title");
const authFlowCopy = document.getElementById("auth-flow-copy");
const studentPin = document.getElementById("student-pin");
const newPin = document.getElementById("new-pin");
const confirmPin = document.getElementById("confirm-pin");
const verificationCode = document.getElementById("verification-code");
let mode = "student_login";
let pinSetupIntent = "first_time";
let verificationPurpose = "signup";
let verificationEmail = "";
const verificationStorageKey = "smartVerify.emailVerification";
const pinSetupStorageKey = "smartVerify.pinSetupPending";
const continuePinSetupLink = document.getElementById("continue-pin-setup");
let canContinuePinSetup = false;
const predictablePins = new Set([
  "0123", "1234", "2345", "3456", "4567", "5678", "6789",
  "9876", "8765", "7654", "6543", "5432", "4321", "3210",
  "1212", "2121", "2580",
]);

function setFieldError(input, message = "") {
  const field = input.closest(".field");
  let error = field.querySelector(".field-error");
  if (!error) {
    error = document.createElement("small");
    error.className = "field-error";
    error.id = `${input.id}-error`;
    error.setAttribute("role", "alert");
    error.hidden = true;
    field.append(error);
  }

  if (message) {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    const describedBy = new Set((input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    describedBy.add(error.id);
    input.setAttribute("aria-describedby", [...describedBy].join(" "));
    return;
  }

  error.hidden = true;
  input.removeAttribute("aria-invalid");
  const describedBy = (input.getAttribute("aria-describedby") || "").split(/\s+/)
    .filter((id) => id && id !== error.id);
  if (describedBy.length) input.setAttribute("aria-describedby", describedBy.join(" "));
  else input.removeAttribute("aria-describedby");
}

function validationMessage(input) {
  if (input.validity.valueMissing) return "Required.";
  if (input.validity.typeMismatch) return "Enter a valid email address.";
  if (input.validity.patternMismatch) {
    return input.id === "verification-code" ? "Enter the full email code." : "Enter a 4-digit PIN.";
  }
  if (input.validity.tooShort) return `Use at least ${input.minLength} characters.`;
  if (input.validity.customError) return input.validationMessage;
  return "";
}

function validateForm() {
  for (const inputId of ["signup-email", "recovery-email"]) {
    const emailInput = document.getElementById(inputId);
    const hasEmail = emailInput.value.trim() !== "";
    emailInput.setCustomValidity(
      hasEmail && !/^[^@]+@kld\.edu\.ph$/i.test(emailInput.value.trim())
        ? "Use a school email ending in @kld.edu.ph."
        : "",
    );
  }

  if (mode === "email_verification") {
    verificationCode.setCustomValidity(
      verificationCode.value && !/^(?:\d{6}|\d{8})$/.test(verificationCode.value)
        ? "Enter the full email code (6 or 8 digits)."
        : "",
    );
  }

  if (mode === "pin_setup") {
    const pinsEntered = newPin.value.length === 4 && confirmPin.value.length === 4;
    confirmPin.setCustomValidity(
      pinsEntered && newPin.value !== confirmPin.value ? "PINs don't match." : "",
    );
  }

  let firstInvalid = null;
  form.querySelectorAll("input[required]:not(:disabled)").forEach((input) => {
    const message = validationMessage(input);
    setFieldError(input, message);
    if (message && !firstInvalid) firstInvalid = input;
  });

  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.hidden = false;
}

function rememberEmailVerification(email, purpose) {
  verificationEmail = email;
  verificationPurpose = purpose;
  sessionStorage.setItem(verificationStorageKey, JSON.stringify({ email, purpose }));
}

function rememberPendingPinSetup(userId, email, intent = "first_time") {
  sessionStorage.setItem(pinSetupStorageKey, JSON.stringify({ userId, email, intent }));
}

function hasPendingPinSetup(user) {
  const saved = sessionStorage.getItem(pinSetupStorageKey);
  if (!saved) return false;

  try {
    const pending = JSON.parse(saved);
    return pending?.userId === user.id &&
      pending.email === user.email &&
      ["first_time", "reset"].includes(pending.intent);
  } catch {
    sessionStorage.removeItem(pinSetupStorageKey);
    return false;
  }
}

function restoreEmailVerification() {
  const saved = sessionStorage.getItem(verificationStorageKey);
  if (!saved) return false;

  let pending;
  try {
    pending = JSON.parse(saved);
  } catch {
    sessionStorage.removeItem(verificationStorageKey);
    return false;
  }
  if (
    !pending ||
    typeof pending.email !== "string" ||
    !/^[^@]+@kld\.edu\.ph$/i.test(pending.email) ||
    !["signup", "recovery"].includes(pending.purpose)
  ) {
    sessionStorage.removeItem(verificationStorageKey);
    return false;
  }

  verificationEmail = pending.email;
  verificationPurpose = pending.purpose;
  pinSetupIntent = pending.purpose === "recovery" ? "reset" : "first_time";
  document.getElementById("verification-email").value = pending.email;
  setMode("email_verification");
  showStatus(`Enter the email code sent to ${pending.email}.`);
  return true;
}

function setMode(nextMode) {
  mode = nextMode;
  const activeRole = mode.startsWith("staff_") ? "staff" : "student";
  modeTabs.forEach((tab) => {
    const selected = tab.dataset.roleTab === activeRole;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  modeFields.forEach((field) => {
    const visible = field.dataset.modeField === mode;
    field.hidden = !visible;
    field.querySelectorAll("input").forEach((input) => {
      input.required = visible;
      input.disabled = !visible;
      if (!visible) {
        input.value = "";
        input.setCustomValidity("");
      }
      setFieldError(input);
    });
  });
  continuePinSetupLink.hidden = mode !== "student_login" || !canContinuePinSetup;
  const modeContent = {
    student_login: ["Student access", "Sign in with your Student ID", ""],
    signup: [
      "Step 1 of 2 · Account",
      "Create your student account",
      "Enter your name, choose a Student ID, and use a @kld.edu.ph email you can access. We’ll email you a code to verify your address.",
    ],
    email_verification: [
      "Verify your school email",
      "Enter your email code",
      `Enter the email code sent to ${verificationEmail}.`,
    ],
    recovery_email: [
      "Forgot your PIN?",
      "Verify your school email",
      "We’ll send a one-time code to your KLD email so you can choose a new PIN.",
    ],
    pin_setup: pinSetupIntent === "reset"
      ? [
          "Forgot your PIN?",
          "Reset your student PIN",
          "Verify your KLD email with the code we sent, then choose a new 4-digit PIN.",
        ]
      : [
          "Step 2 of 2 · Sign-in PIN",
          "Create your student PIN",
          "Your school email is verified. Choose the 4-digit PIN you’ll use to sign in.",
        ],
    staff_login: ["Staff access", "Staff sign in", ""],
    staff_signup: [
      "Approved administrators",
      "Create an admin account",
      "Only an email approved by the project owner can become an administrator. Use your own password and confirm your email to finish setup.",
    ],
  }[mode];
  authEyebrow.textContent = modeContent[0];
  authTitle.textContent = modeContent[1];
  authFlowCopy.textContent = modeContent[2];
  authFlowCopy.hidden = !modeContent[2];
  submitButton.textContent = {
    student_login: "Sign in",
    signup: "Create account & continue",
    email_verification: "Verify code",
    recovery_email: "Send code",
    pin_setup: pinSetupIntent === "reset" ? "Reset PIN" : "Create PIN",
    staff_login: "Staff Sign In",
    staff_signup: "Create admin account",
  }[mode];
  status.hidden = true;
  status.textContent = "";
}

function redirectForRole(profile) {
  if (profile.role === "student") return "student.html";
  if (profile.role === "admin") return "dashboard.html";
  throw new Error("This account does not have an authorized role.");
}

async function finishLogin(user, expectedRole) {
  const profile = await getProfile(user.id);
  if (expectedRole && profile.role !== expectedRole) {
    await supabase.auth.signOut();
    throw new Error("This sign-in method is not enabled for your account.");
  }
  location.replace(redirectForRole(profile));
}

async function restoreSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    restoreEmailVerification();
    return;
  }

  let profile;
  try {
    profile = await getProfile(data.session.user.id);
  } catch (profileError) {
    const user = data.session.user;
    if (
      profileError instanceof ProfileUnavailableError &&
      user.email_confirmed_at &&
      /^[^@]+@kld\.edu\.ph$/i.test(user.email || "") &&
      hasPendingPinSetup(user)
    ) {
      const pending = JSON.parse(sessionStorage.getItem(pinSetupStorageKey));
      pinSetupIntent = pending.intent;
      canContinuePinSetup = true;
      setMode("student_login");
      showStatus("Your email is verified. Sign in if you already have a PIN, or choose Continue account setup to create one.");
      return;
    }
    if (profileError instanceof ProfileUnavailableError) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setMode("student_login");
      return;
    }
    throw profileError;
  }
  if (profile.role === "student" && !profile.pin_configured) {
    pinSetupIntent = "first_time";
    rememberPendingPinSetup(data.session.user.id, data.session.user.email, pinSetupIntent);
    canContinuePinSetup = true;
    setMode("student_login");
    showStatus("Your email is verified. Sign in if you already have a PIN, or choose Continue account setup to create one.");
    return;
  }
  location.replace(redirectForRole(profile));
}

async function callPinFunction(body) {
  const { data, error } = await supabase.functions.invoke("student-pin-auth", { body });
  if (!error) return data;

  if (error.message?.toLowerCase().includes("failed to send a request to the edge function")) {
    throw new Error(`The PIN service could not be reached. In Supabase Edge Function secrets, set APP_ORIGINS to include this exact site origin: ${location.origin}. Also confirm student-pin-auth is deployed with --no-verify-jwt.`);
  }

  const response = error.context;
  const statusCode = response instanceof Response ? response.status : undefined;
  if (statusCode === 429) {
    throw new Error("Too many attempts. Wait 15 minutes and try again.");
  }
  if (body.action === "login" && statusCode === 401) {
    throw new Error("Student ID or PIN is incorrect.");
  }

  if (body.action === "set_pin" && statusCode === 401) {
    throw new Error("Your email verification session has expired. Request a new email code, verify it, then set your PIN.");
  }

  if (response instanceof Response) {
    const responseBody = await response.text();
    if (responseBody) {
      let payload;
      try {
        payload = JSON.parse(responseBody);
      } catch {
        payload = null;
      }
      if (typeof payload?.error === "string" && payload.error) {
        throw new Error(payload.error);
      }
      if (!responseBody.trimStart().startsWith("{")) {
        throw new Error(responseBody);
      }
    }
  }

  throw new Error(error.message || "Could not reach the authentication service.");
}

async function loginWithStudentPin() {
  const pin = studentPin.value;
  studentPin.value = "";
  const result = await callPinFunction({
    action: "login",
    student_id: document.getElementById("student-id").value.trim(),
    pin,
  });
  if (!result?.token_hash) throw new Error("Authentication service returned an invalid response.");

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: result.token_hash,
    type: "magiclink",
  });
  if (error) throw new Error("Student ID or PIN is incorrect.");
  await finishLogin(data.user, "student");
}

async function createStudentAccount() {
  const email = document.getElementById("signup-email").value.trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: document.getElementById("signup-password").value,
    options: {
      emailRedirectTo: `${location.origin}/index.html`,
      data: {
        full_name: document.getElementById("signup-full-name").value.trim(),
        student_no: document.getElementById("signup-student-id").value.trim(),
      },
    },
  });
  if (error) {
    if (error.message?.toLowerCase().includes("database error saving new user")) {
      throw new Error("Supabase could not save the signup. Ask the project owner to run the latest supabase-setup.sql and check Supabase Auth logs.");
    }
    throw error;
  }

  if (data.user && data.user.identities?.length === 0) {
    document.getElementById("recovery-email").value = email;
    pinSetupIntent = "reset";
    setMode("recovery_email");
    showStatus("This email may already have a Smart-Verify account, so no signup code was sent. Use Send code to verify your email and reset your PIN, or return to sign in.");
    return;
  }

  verificationEmail = email;
  verificationPurpose = "signup";
  pinSetupIntent = "first_time";
  if (data.session) {
    sessionStorage.removeItem(verificationStorageKey);
    rememberPendingPinSetup(data.user.id, data.user.email, pinSetupIntent);
    canContinuePinSetup = true;
    setMode("pin_setup");
    showStatus("Account created and email verified. Create your 4-digit sign-in PIN below.");
    return;
  }
  rememberEmailVerification(email, "signup");
  document.getElementById("verification-email").value = email;
  setMode("email_verification");
  showStatus("We sent a verification code to your KLD email. Enter it here to continue.");
}

async function startPinRecovery() {
  const email = document.getElementById("recovery-email").value.trim();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;

  rememberEmailVerification(email, "recovery");
  pinSetupIntent = "reset";
  document.getElementById("verification-email").value = email;
  setMode("email_verification");
  showStatus("If a Smart-Verify account exists for that KLD email, we sent a PIN reset code.");
}

async function verifyEmailCode() {
  const { data, error } = await supabase.auth.verifyOtp({
    email: verificationEmail,
    token: verificationCode.value.trim(),
    type: verificationPurpose === "signup" ? "signup" : "recovery",
  });
  if (error) {
    if (error.message?.toLowerCase().includes("database error saving new user")) {
      throw new Error("Email code could not be finalized. Ask the project owner to run the latest supabase-setup.sql and check Supabase Auth logs.");
    }
    if (error.message?.toLowerCase().includes("error confirming user")) {
      throw new Error("Supabase could not confirm this account. Ask the project owner to run the latest supabase-setup.sql and check Supabase Auth logs.");
    }
    if (["otp_expired", "email_not_confirmed"].includes(error.code)) {
      throw new Error("Supabase rejected this code as expired or already used. If this email already has a Smart-Verify account, return to sign in and choose Forgot PIN to get a recovery code. Otherwise, request a new signup code and use only the latest one.");
    }
    if (error.code === "invalid_credentials") {
      throw new Error("The code is incorrect or no longer valid. Use the latest code for this email. If the account was already created, choose Forgot PIN from Student Sign In.");
    }
    throw error;
  }
  if (!data.session || !data.user?.email_confirmed_at) {
    throw new Error("Email verification did not create a confirmed session. Request a new code and try again.");
  }
  if (!/^[^@]+@kld\.edu\.ph$/i.test(data.user.email || "")) {
    await supabase.auth.signOut();
    throw new Error("Student accounts require a confirmed @kld.edu.ph email address.");
  }

  pinSetupIntent = verificationPurpose === "recovery" ? "reset" : "first_time";
  rememberPendingPinSetup(data.user.id, data.user.email, pinSetupIntent);
  canContinuePinSetup = true;
  sessionStorage.removeItem(verificationStorageKey);
  verificationCode.value = "";
  setMode("pin_setup");
  showStatus(
    verificationPurpose === "recovery"
      ? "Email verified. Choose a new 4-digit PIN."
      : "Email verified. Create your 4-digit PIN to finish setting up your account.",
  );
}

async function resendEmailCode() {
  if (!verificationEmail) throw new Error("Enter your KLD email again to request a new code.");

  const { error } = verificationPurpose === "signup"
    ? await supabase.auth.resend({ type: "signup", email: verificationEmail })
    : await supabase.auth.resetPasswordForEmail(verificationEmail);
  if (error) throw error;
  showStatus("A new verification code has been sent. Check your inbox.");
}

async function createAdminAccount() {
  const email = document.getElementById("staff-signup-email").value.trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: document.getElementById("staff-signup-password").value,
    options: {
      emailRedirectTo: `${location.origin}/index.html`,
      data: {
        account_type: "admin",
        full_name: document.getElementById("staff-signup-name").value.trim(),
      },
    },
  });
  if (error) throw error;

  document.getElementById("staff-email").value = email;
  if (data.session) {
    await finishLogin(data.user, "admin");
    return;
  }

  setMode("staff_login");
  showStatus("Account request submitted. Confirm the approved email address, then sign in here. The project owner must add your email to the admin allowlist first.");
}

async function setStudentPin() {
  if (/^(\d)\1{3}$/.test(newPin.value) || predictablePins.has(newPin.value)) {
    showStatus("Choose a less predictable 4-digit PIN.", true);
    newPin.focus();
    return;
  }
  if (newPin.value !== confirmPin.value) {
    confirmPin.setCustomValidity("PINs don't match.");
    setFieldError(confirmPin, confirmPin.validationMessage);
    confirmPin.focus();
    return;
  }
  confirmPin.setCustomValidity("");

  try {
    await callPinFunction({ action: "set_pin", pin: newPin.value });
  } catch (error) {
    newPin.value = "";
    confirmPin.value = "";
    throw error;
  }

  newPin.value = "";
  confirmPin.value = "";
  sessionStorage.removeItem(pinSetupStorageKey);
  canContinuePinSetup = false;
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) throw signOutError;

  form.reset();
  pinSetupIntent = "first_time";
  setMode("student_login");
  if (new URLSearchParams(location.search).get("setup-pin") === "1") {
    setMode("pin_setup");
  }
  showStatus("PIN saved securely. Sign in with your Student ID and PIN.");
}

async function loginStaff() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: document.getElementById("staff-email").value.trim(),
    password: document.getElementById("staff-password").value,
  });
  if (
    error?.code === "invalid_credentials" ||
    error?.message === "Invalid login credentials"
  ) {
    throw new Error(
      "We couldn't sign you in. Check your email and password. If this email hasn't been approved for admin access, ask the project owner to approve it first.",
    );
  }
  if (error) throw error;
  await finishLogin(data.user, "admin");
}

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setMode(tab.dataset.roleTab === "staff" ? "staff_login" : "student_login");
  });
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(modeTabs);
    const currentIndex = tabs.indexOf(tab);
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    const targetRole = tabs[targetIndex].dataset.roleTab;
    setMode(targetRole === "staff" ? "staff_login" : "student_login");
    document.querySelector(`[data-role-tab="${targetRole}"]`).focus();
  });
});

modeLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (link.dataset.pinIntent) pinSetupIntent = link.dataset.pinIntent;
    setMode(link.dataset.mode);
    form.querySelector(`[data-mode-field="${mode}"] input:not(:disabled)`)?.focus();
  });
});

document.querySelectorAll("[data-pin-input]").forEach((input) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
    if (mode === "pin_setup" && newPin.value.length === 4 && confirmPin.value.length === 4) {
      confirmPin.setCustomValidity(newPin.value === confirmPin.value ? "" : "PINs don't match.");
    } else {
      confirmPin.setCustomValidity("");
    }
    const message = validationMessage(input);
    if (!message) setFieldError(input);
  });
});

form.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", () => {
    if (input.id === "signup-email") {
      const hasEmail = input.value.trim() !== "";
      input.setCustomValidity(
        hasEmail && !/^[^@]+@kld\.edu\.ph$/i.test(input.value.trim())
          ? "Use a school email ending in @kld.edu.ph."
          : "",
      );
    }
    if (input.id === "recovery-email") {
      const hasEmail = input.value.trim() !== "";
      input.setCustomValidity(
        hasEmail && !/^[^@]+@kld\.edu\.ph$/i.test(input.value.trim())
          ? "Use a school email ending in @kld.edu.ph."
          : "",
      );
    }
    if (input.id === "verification-code") {
      input.value = input.value.replace(/\D/g, "").slice(0, 8);
      input.setCustomValidity(
        input.value && !/^(?:\d{6}|\d{8})$/.test(input.value)
          ? "Enter the full email code (6 or 8 digits)."
          : "",
      );
    }
    if (!input.matches("[data-pin-input]") && input.validity.valid) setFieldError(input);
  });
});

document.getElementById("resend-verification-code").addEventListener("click", async () => {
  try {
    await resendEmailCode();
  } catch (error) {
    showStatus(error.message || "Could not resend the verification code.", true);
  }
});

if (!isSupabaseConfigured) {
  submitButton.disabled = true;
  showStatus("Connect Supabase first: add your project URL and publishable key in js/supabase.js.", true);
} else {
  restoreSession().catch((error) => showStatus(error.message, true));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateForm()) return;
  if (!isSupabaseConfigured) {
    showStatus("Connect Supabase first: add your project URL and publishable key in js/supabase.js.", true);
    return;
  }

  submitButton.disabled = true;
  status.hidden = true;
  try {
    if (mode === "student_login") await loginWithStudentPin();
    else if (mode === "signup") await createStudentAccount();
    else if (mode === "email_verification") await verifyEmailCode();
    else if (mode === "recovery_email") await startPinRecovery();
    else if (mode === "pin_setup") await setStudentPin();
    else if (mode === "staff_signup") await createAdminAccount();
    else await loginStaff();
  } catch (error) {
    showStatus(error.message || "Authentication failed. Please try again.", true);
  } finally {
    submitButton.disabled = false;
  }
});

setMode("student_login");
