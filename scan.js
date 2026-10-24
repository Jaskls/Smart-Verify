/* [scan.js: QR + barcode scanning with the camera (html5-qrcode library)]

  const code = await scanCode("Scan the tool");   // text in the QR, or null
• The camera only works on HTTPS or on localhost.
• If scanning fails, the person can type the code in the normal search boxes.
• Ask the instructor if using this library is allowed */
// Formats the scanner reads: QR plus the common barcodes found on ID cards and stickers.
const FORMATS = () => {
  const F = window.Html5QrcodeSupportedFormats;
  return [F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.ITF, F.CODABAR];
};
const LIB_URL = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";

function loadLibrary() {
  if (window.Html5Qrcode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LIB_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load the scanner. Check the internet connection."));
    document.head.appendChild(s);
  });
}

function getDialog() {
  let dlg = document.getElementById("scan-dialog");
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.id = "scan-dialog";
  dlg.style.cssText = "border:2px solid var(--ink,#191a23);border-radius:18px;padding:18px;max-width:92vw;background:var(--card,#fff);color:var(--text,#191a23);box-shadow:var(--shadow,4px 4px 0 rgba(25,26,35,.16))";
  dlg.innerHTML = `
    <h3 id="scan-title" style="margin:0 0 10px;font:700 17px system-ui"></h3>
    <div id="qr-reader" style="width:min(380px,80vw)"></div>
    <p id="scan-msg" style="font:13px system-ui;color:var(--muted,#555);margin:10px 0"></p>
    <div id="scan-typed" style="display:none;gap:8px;margin-bottom:10px">
      <input id="scan-input" class="input mono" placeholder="Type the code, e.g. SV-EQ-0009" autocomplete="off" style="flex:1;min-width:0">
      <button type="button" id="scan-use" class="btn btn-green">Use code</button>
    </div>
    <label class="btn" style="display:block;text-align:center;margin-bottom:8px;cursor:pointer">Or take / choose a photo of the code
      <input type="file" id="scan-file" accept="image/*" capture="environment" hidden></label>
    <div style="display:flex;gap:8px">
      <button type="button" id="scan-type" class="btn" style="flex:1">Type the code instead</button>
      <button type="button" id="scan-cancel" class="btn" style="flex:1">Cancel</button>
    </div>`;
  document.body.appendChild(dlg);
  return dlg;
}

export async function scanCode(title = "Scan QR code or barcode") {
  const dlg = getDialog();
  const msg = dlg.querySelector("#scan-msg");
  dlg.querySelector("#scan-title").textContent = title;
  msg.textContent = "Starting camera…";
  const typedRow = dlg.querySelector("#scan-typed"), typedInput = dlg.querySelector("#scan-input");
  typedRow.style.display = "none"; typedInput.value = "";
  dlg.showModal();

  if (!window.isSecureContext) {
    msg.textContent = "The camera needs HTTPS or localhost. Type the code instead.";
  }

  let scanner = null;
  let finished = false;

  const stop = async () => {
    try { if (scanner) { await scanner.stop(); scanner.clear(); } } catch { /* already stopped */ }
    scanner = null;
  };

  return new Promise((resolve) => {
    const finish = async (value) => {
      if (finished) return;
      finished = true;
      await stop();
      dlg.close();
      resolve(value);
    };
    dlg.querySelector("#scan-cancel").onclick = () => finish(null);
    // "Type the code instead": stop the camera, show a box, and hand back what was typed.
    const useTyped = () => { const v = typedInput.value.trim(); if (v) finish(v); else typedInput.focus(); };
    dlg.querySelector("#scan-type").onclick = async () => {
      await stop();
      msg.textContent = "Type the code printed under the QR sticker, then tap Use code.";
      typedRow.style.display = "flex";
      typedInput.focus();
    };
    dlg.querySelector("#scan-use").onclick = useTyped;
    typedInput.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); useTyped(); } };
    dlg.querySelector("#scan-file").onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      msg.textContent = "Reading the photo…";
      try {
        await loadLibrary();
        await stop();
        const reader = new window.Html5Qrcode("qr-reader", { formatsToSupport: FORMATS() });
        const text = await reader.scanFile(file, false);
        finish(text.trim());
      } catch { msg.textContent = "No code found in that photo. Try again, closer and in better light."; }
      ev.target.value = "";
    };
    dlg.addEventListener("close", () => finish(null), { once: true });

    loadLibrary()
      .then(() => {
        scanner = new window.Html5Qrcode("qr-reader", { formatsToSupport: FORMATS(), useBarCodeDetectorIfSupported: true });
        return scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 160 } },
          (text) => finish(text.trim()),
          () => {} // ignore "no QR in this frame"
        );
      })
      .then(() => { msg.textContent = "Point the camera at the QR code or barcode."; })
      .catch((err) => {
        const name = (err && err.name) || "";
        const text = String(err && err.message ? err.message : err);
        if (name === "NotAllowedError" || /permission/i.test(text)) msg.textContent = "Camera is blocked. Tap the lock icon in the address bar, allow Camera, then try again.";
        else if (name === "NotFoundError" || /no camera|requested device not found/i.test(text)) msg.textContent = "No camera was found on this device.";
        else if (name === "NotReadableError") msg.textContent = "The camera is being used by another app. Close it and try again.";
        else msg.textContent = `${text} You can also take a photo of the code below, or cancel and type it.`;
      });
  });
}