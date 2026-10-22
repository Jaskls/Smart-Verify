/* [scan.js: QR scanning with the camera (html5-qrcode library)]

  const code = await scanCode("Scan the tool");   // text in the QR, or null
• The camera only works on HTTPS or on localhost.
• If scanning fails, the person can type the code in the normal search boxes.
• Ask the instructor if using this library is allowed */
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
  dlg.style.cssText = "border:1px solid #c5ccd8;border-radius:12px;padding:18px;max-width:92vw";
  dlg.innerHTML = `
    <h3 id="scan-title" style="margin:0 0 10px;font:600 16px system-ui"></h3>
    <div id="qr-reader" style="width:min(380px,80vw)"></div>
    <p id="scan-msg" style="font:13px system-ui;color:#555;margin:10px 0"></p>
    <button type="button" id="scan-cancel" class="btn">Cancel (type the code instead)</button>`;
  document.body.appendChild(dlg);
  return dlg;
}

export async function scanCode(title = "Scan QR code") {
  const dlg = getDialog();
  const msg = dlg.querySelector("#scan-msg");
  dlg.querySelector("#scan-title").textContent = title;
  msg.textContent = "Starting camera…";
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
    dlg.addEventListener("close", () => finish(null), { once: true });

    loadLibrary()
      .then(() => {
        scanner = new window.Html5Qrcode("qr-reader");
        return scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (text) => finish(text.trim()),
          () => {} // ignore "no QR in this frame"
        );
      })
      .then(() => { msg.textContent = "Point the camera at the QR sticker."; })
      .catch((err) => {
        msg.textContent = `${err.message || err} You can cancel and type the code instead.`;
      });
  });
}