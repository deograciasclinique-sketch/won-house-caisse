// WON HOUSE — pont entre l'application et Firebase (connexion, données partagées, photos, caméra).
// L'application (www/index.html) appelle window.claude.use("db" | "assets" | "user" | "downloads") :
// ce fichier fournit ces mêmes fonctions, branchées sur Firebase Auth + Firestore.
import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, waitForPendingWrites,
  doc, collection, getDoc, getDocs, getDocFromServer, setDoc, deleteDoc, onSnapshot, writeBatch, limit, query,
} from "firebase/firestore";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import SEED from "./seed.json";

const cfg = window.FIREBASE_CONFIG;
let app = null, auth = null, fs = null, currentUser = null;
let readyResolve; const ready = new Promise(r => (readyResolve = r));

/* ---------------- écran de connexion ---------------- */
const CSS = `
.wh-login{position:fixed;inset:0;z-index:100;background:linear-gradient(135deg,#7A1726,#B8352A 55%,#E39A1E);display:flex;align-items:center;justify-content:center;padding:20px;font-family:"Nunito Sans",system-ui,sans-serif}
.wh-card{background:#fff;color:#1B211E;border-radius:22px;padding:22px 18px;width:100%;max-width:380px;box-shadow:0 20px 50px rgba(0,0,0,.25)}
.wh-card h1{font:800 22px/1.1 system-ui,sans-serif;letter-spacing:.05em;margin:6px 0 2px;text-align:center}
.wh-card p{color:#5E6862;text-align:center;margin:0 0 16px;font-size:14px}
.wh-card label{display:block;font-size:12px;font-weight:700;color:#5E6862;text-transform:uppercase;letter-spacing:.08em;margin:12px 0 5px}
.wh-card input{width:100%;box-sizing:border-box;border:1px solid #D7DBD4;background:#F3F4F1;border-radius:12px;padding:13px;font-size:16px}
.wh-card button{width:100%;margin-top:18px;border:0;border-radius:14px;padding:15px;font-size:16px;font-weight:800;color:#fff;background:linear-gradient(135deg,#7A1726,#B8352A 55%,#E39A1E)}
.wh-card button:disabled{opacity:.6}
.wh-card .err{color:#B42318;font-size:13.5px;text-align:center;margin-top:12px;min-height:18px}
.wh-card .link{background:none;color:#8C1D2B;font-weight:700;font-size:13.5px;padding:8px;margin-top:6px}
.wh-logo{width:72px;height:72px;border-radius:22px;margin:0 auto;display:grid;place-items:center;background:linear-gradient(135deg,#7A1726,#B8352A 55%,#E39A1E)}
.wh-cam{position:fixed;inset:0;z-index:200;background:#000;display:flex;flex-direction:column}
.wh-cam video,.wh-cam img{flex:1;width:100%;height:100%;object-fit:cover;min-height:0}
.wh-cam .bar{display:flex;align-items:center;justify-content:space-around;padding:16px 10px calc(18px + env(safe-area-inset-bottom,0px));background:rgba(0,0,0,.85)}
.wh-cam .top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:calc(12px + env(safe-area-inset-top,0px)) 14px 12px;background:linear-gradient(rgba(0,0,0,.6),transparent);color:#fff;font:700 15px system-ui,sans-serif}
.wh-cam .ic{width:52px;height:52px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:22px}
.wh-cam .shoot{width:78px;height:78px;border-radius:50%;border:5px solid #fff;background:#E39A1E;box-shadow:0 0 0 4px rgba(227,154,30,.35)}
.wh-cam .shoot:active{transform:scale(.92)}
.wh-cam .txt{border:0;border-radius:14px;padding:14px 22px;font-size:16px;font-weight:800}
.wh-cam .ok{background:linear-gradient(135deg,#B8352A,#E39A1E);color:#fff}
.wh-cam .no{background:rgba(255,255,255,.18);color:#fff}
.wh-cam .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .15s}
`;
const LOGO = `<svg viewBox="0 0 40 40" width="50" height="50" fill="none"><g stroke="#FFE2B0" stroke-width="2.2" stroke-linecap="round"><path d="M14 13c-2-3 2-4 0-7"/><path d="M20 13c-2-3 2-4 0-7"/><path d="M26 13c-2-3 2-4 0-7"/></g><ellipse cx="20" cy="25" rx="15" ry="4.2" fill="#fff"/><path d="M8 24c1 7 6 10 12 10s11-3 12-10" fill="#fff"/><ellipse cx="20" cy="24" rx="11" ry="2.6" fill="#F3C969"/></svg>`;
function addCss() { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); }

function showLogin(message) {
  let el = document.getElementById("wh-login");
  if (el) return;
  el = document.createElement("div"); el.id = "wh-login"; el.className = "wh-login";
  el.innerHTML = `<form class="wh-card" autocomplete="on">
    <div class="wh-logo">${LOGO}</div>
    <h1>WON HOUSE</h1><p>Caisse du restaurant</p>
    <label for="wh-email">E-mail</label><input id="wh-email" type="email" autocomplete="username" required>
    <label for="wh-pass">Mot de passe</label><input id="wh-pass" type="password" autocomplete="current-password" required>
    <label for="wh-name">Votre prénom</label><input id="wh-name" placeholder="ex. Awa" autocomplete="given-name">
    <button type="submit" id="wh-go">Se connecter</button>
    <div class="err" id="wh-err">${message || ""}</div>
    <button type="button" class="link" id="wh-forgot">Mot de passe oublié ?</button>
  </form>`;
  document.body.appendChild(el);
  try { document.getElementById("wh-name").value = localStorage.getItem("wh-name") || ""; } catch (e) {}
  el.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("wh-go"), err = document.getElementById("wh-err");
    const email = document.getElementById("wh-email").value.trim().toLowerCase(), pass = document.getElementById("wh-pass").value;
    const name = document.getElementById("wh-name").value.trim();
    btn.disabled = true; btn.textContent = "Connexion…"; err.textContent = "";
    try {
      try { localStorage.setItem("wh-name", name); } catch (e) {}
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (name) await setDoc(doc(fs, "users", cred.user.uid), { name, email }, { merge: true });
    } catch (ex) {
      const c = ex && ex.code || "";
      const msg = {
        "auth/network-request-failed": "Pas de connexion internet. Réessayez.",
        "auth/too-many-requests": "Trop d'essais. Attendez quelques minutes.",
        "auth/invalid-email": "L'e-mail n'est pas bien écrit (ex. nom@gmail.com).",
        "auth/missing-password": "Tapez le mot de passe.",
        "auth/user-not-found": "Ce compte n'existe pas. Créez-le dans Firebase → Authentication → Users.",
        "auth/wrong-password": "Mot de passe incorrect.",
        "auth/invalid-credential": "E-mail ou mot de passe incorrect, ou compte pas encore créé dans Firebase → Authentication → Users.",
        "auth/invalid-login-credentials": "E-mail ou mot de passe incorrect, ou compte pas encore créé dans Firebase → Authentication → Users.",
        "auth/user-disabled": "Ce compte a été désactivé par le propriétaire.",
        "auth/operation-not-allowed": "La connexion par e-mail n'est pas activée : Firebase → Authentication → Sign-in method → E-mail/Mot de passe → Activer.",
        "auth/configuration-not-found": "Authentication n'est pas encore activé : Firebase → Authentication → Commencer, puis activer E-mail/Mot de passe.",
        "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Configuration Firebase invalide.",
      };
      err.textContent = (msg[c] || ("Connexion refusée (" + (c || "erreur inconnue") + ")."));
      btn.disabled = false; btn.textContent = "Se connecter";
    }
  });
  document.getElementById("wh-forgot").addEventListener("click", async () => {
    const email = document.getElementById("wh-email").value.trim(), err = document.getElementById("wh-err");
    if (!email) { err.textContent = "Tapez d'abord votre e-mail."; return; }
    try { await sendPasswordResetEmail(auth, email); err.style.color = "#1F7A4D"; err.textContent = "Un e-mail pour changer le mot de passe a été envoyé."; }
    catch (e) { err.textContent = "Envoi impossible. Vérifiez l'e-mail."; }
  });
}
function hideLogin() { document.getElementById("wh-login")?.remove(); }

/* ---------------- état de la synchronisation ---------------- */
function explain(e) {
  const c = (e && e.code) || "", m = String((e && e.message) || e || "");
  if (c === "permission-denied" || /permission/i.test(m)) return "Firebase refuse l'accès : les règles Firestore ne sont pas publiées. Console Firebase → Firestore Database → Règles → coller les règles → Publier.";
  if (/does not exist|not.?found/i.test(m) || c === "not-found") return "La base Firestore n'existe pas encore. Console Firebase → Firestore Database → Créer une base de données.";
  if (c === "failed-precondition") return "Base Firestore pas prête : " + m;
  if (c === "unauthenticated") return "Session expirée : déconnectez-vous puis reconnectez-vous.";
  if (c === "unavailable" || /offline|network/i.test(m)) return "Pas de connexion au serveur. Vérifiez internet : les saisies partiront dès le retour du réseau.";
  if (c === "resource-exhausted") return "Quota Firebase gratuit dépassé pour aujourd'hui.";
  return "Erreur Firebase (" + (c || "inconnue") + ") : " + m;
}
const ST = { state: "init", msg: "", lastServer: null, size: null };

/* ---------------- saisies hors ligne ----------------
   Chaque enregistrement est écrit tout de suite dans la base du téléphone (cache Firestore
   persistant) : l'application n'attend jamais le serveur. Firebase garde la file d'envoi,
   même si l'application est fermée, et l'envoie dès que internet revient. */
const PKEY = "wh-pending";
let pending = 0;            // saisies de cette session pas encore confirmées par le serveur
let oldPending = 0;         // saisies laissées en attente par une session précédente
try { oldPending = Number(localStorage.getItem(PKEY)) || 0; } catch (e) {}
const waiting = () => pending + oldPending;
function savePending() { try { localStorage.setItem(PKEY, String(waiting())); } catch (e) {} }
function shimToast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
function flushed() {
  if (waiting() > 0) return;
  savePending();
  if (ST.hadWaiting) { ST.hadWaiting = false; shimToast("✓ Saisies hors ligne envoyées au serveur"); }
  if (ST.state !== "error") setState(navigator.onLine === false ? "offline" : "ok");
}
function track(p) {
  pending++; ST.hadWaiting = true; savePending(); setPill();
  p.then(() => {}, (e) => { const x = explain(e); setState("error", x); shimToast("⚠ " + x); })
    .finally(() => { pending = Math.max(0, pending - 1); savePending(); setPill(); flushed(); window.__rerender && window.__rerender(); });
}
// Lance l'écriture et rend la main immédiatement (la saisie est déjà enregistrée sur le téléphone).
function write(fn) {
  let p;
  try { p = fn(); } catch (e) { return Promise.reject(wrapErr(e)); } // données invalides : erreur immédiate
  track(p);
  return Promise.resolve();
}
function wrapErr(e) { const x = new Error(explain(e)); x.code = e && e.code; x.wh = explain(e); return x; }

function setPill() {
  const m = document.getElementById("mode"); if (!m) return;
  const n = waiting();
  let state = ST.state;
  if (n > 0 && state === "ok") state = "sending";
  const t = { ok: ["● Synchronisé", "mode live"], sending: [n ? `◐ Envoi de ${n}…` : "◐ Envoi…", "mode local"], offline: [n ? `◐ Hors ligne · ${n} en attente` : "◐ Hors ligne", "mode local"], error: ["⚠ Pas synchronisé", "mode local"], init: ["Connexion…", "mode"] }[state];
  m.textContent = t[0]; m.className = t[1]; if (ST.state === "error") { m.style.background = "#FBE7E4"; m.style.color = "#B42318"; } else { m.style.background = ""; m.style.color = ""; }
  m.onclick = () => { const b = document.querySelector('.tabs [data-tab="carte"]'); b && b.click(); setTimeout(() => document.getElementById("wh-diag")?.scrollIntoView({ behavior: "smooth" }), 300); };
}
function setState(state, msg) { const ch = ST.state !== state || ST.msg !== msg; ST.state = state; ST.msg = msg || ""; setPill(); if (ch && document.getElementById("wh-diag")) window.__rerender && window.__rerender(); }
function watchStatus() {
  onSnapshot(collection(fs, "jours"), { includeMetadataChanges: true }, s => {
    if (!s.metadata.fromCache) { ST.lastServer = Date.now(); ST.size = s.size; hasData = s.size > 0; setState(s.metadata.hasPendingWrites ? "sending" : "ok"); }
    else if (ST.state !== "error") setState(navigator.onLine === false ? "offline" : (ST.lastServer ? "sending" : "init"));
  }, e => setState("error", explain(e)));
  const beat = () => currentUser && setDoc(doc(fs, "diag", currentUser.uid), { name: (localStorage.getItem("wh-name") || ""), email: currentUser.email || "", lastSeen: Date.now(), device: navigator.userAgent.slice(0, 120) }, { merge: true }).catch(e => setState("error", explain(e)));
  beat(); setInterval(beat, 5 * 60 * 1000);
  setInterval(setPill, 3000); setInterval(retryImages, 30000);
  window.addEventListener("offline", () => setState("offline"));
  window.addEventListener("online", () => { if (ST.state === "offline" || ST.state === "error") setState(waiting() ? "sending" : "init"); retryImages(); });
  // saisies faites hors ligne lors d'une utilisation précédente : Firebase les renvoie seul, on suit la fin de l'envoi
  if (oldPending > 0) {
    ST.hadWaiting = true; setPill();
    waitForPendingWrites(fs).then(() => { oldPending = 0; savePending(); setPill(); flushed(); window.__rerender && window.__rerender(); }).catch(() => {});
  }
}
const isOffline = e => { const c = (e && e.code) || ""; return c === "unavailable" || /offline|network/i.test(String((e && e.message) || "")); };
function guard(p) { return p.catch(e => { if (isOffline(e)) setState("offline"); else setState("error", explain(e)); throw wrapErr(e); }); }

/* ---------------- adaptateur base de données ---------------- */
const segs = p => p.split("/");
function wrapDocSnap(s) {
  return { id: s.id, exists: s.exists(), data: () => (s.exists() ? s.data() : undefined),
    metadata: { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites } };
}
function docApi(path) {
  const ref = doc(fs, ...segs(path));
  return {
    id: ref.id, path,
    get: async () => wrapDocSnap(await guard(getDoc(ref))),
    // fusion profonde : ne jamais écraser les saisies faites par un autre téléphone.
    // Écriture locale immédiate, envoi au serveur en arrière-plan (fonctionne hors ligne).
    set: (data) => write(() => setDoc(ref, data, { merge: true })),
    update: (data) => write(() => setDoc(ref, data, { merge: true })),
    delete: () => write(() => deleteDoc(ref)),
    acquire: async () => ({ acquired: true }),
    onSnapshot: (next, error) => onSnapshot(ref, { includeMetadataChanges: false }, s => next(wrapDocSnap(s)), e => { setState("error", explain(e)); error && error({ code: "unavailable", message: explain(e), wh: explain(e) }); }),
    collection: (sub) => colApi(path + "/" + sub),
  };
}
function colApi(path) {
  const ref = collection(fs, ...segs(path));
  return {
    path,
    doc: (id) => docApi(path + "/" + (id || Math.random().toString(36).slice(2) + Date.now().toString(36))),
    onSnapshot: (next, error) => onSnapshot(ref, s => {
      const docs = s.docs.map(wrapDocSnap);
      next({ docs, size: docs.length, empty: !docs.length, metadata: s.metadata,
        docChanges: () => s.docChanges().map(c => ({ type: c.type, doc: wrapDocSnap(c.doc), oldIndex: c.oldIndex, newIndex: c.newIndex })) });
    }, e => { setState("error", explain(e)); error && error({ code: "unavailable", message: explain(e), wh: explain(e) }); }),
    get: async () => { const s = await getDocs(ref); const docs = s.docs.map(wrapDocSnap); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [] }; },
  };
}
const dbApi = { doc: docApi, collection: colApi };

/* ---------------- photos (stockées dans Firestore, collection "photos") ---------------- */
const photoCache = {};
function blobToDataURL(b) { return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(b); }); }
async function recompress(blob) {
  // image déjà réduite par l'application ; on s'assure qu'elle reste légère (< 700 Ko)
  let url = await blobToDataURL(blob);
  if (url.length < 700000) return url;
  const img = await createImageBitmap(blob); const k = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}
const assetsApi = {
  upload: async (blob) => {
    const data = await recompress(blob);
    const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    photoCache[id] = data;
    // photo gardée sur le téléphone tout de suite, envoyée au serveur dès que possible
    await write(() => setDoc(doc(fs, "photos", id), { data, at: new Date().toISOString(), by: currentUser?.uid || null }));
    return { id, url: data, sizeBytes: data.length, contentType: "image/jpeg" };
  },
  list: async () => ({ assets: [], usage: {} }),
  delete: async (id) => write(() => deleteDoc(doc(fs, "photos", id))),
};
const waitingImgs = new Set();
async function loadInto(img, id) {
  if (!photoCache[id]) {
    try { const s = await getDoc(doc(fs, "photos", id)); if (s.exists()) photoCache[id] = s.data().data; } catch (e) {}
  }
  if (photoCache[id]) { img.src = photoCache[id]; waitingImgs.delete(img); }
  else waitingImgs.add(img); // pas encore disponible (hors ligne) : on réessaiera au retour d'internet
}
function retryImages() { waitingImgs.forEach(img => { if (!img.isConnected) waitingImgs.delete(img); else loadInto(img, img.dataset.whBlob); }); }
async function hydrate(img) {
  const src = img.getAttribute("src") || "";
  const m = src.match(/\/_blob\/([A-Za-z0-9_-]+)/); if (!m) return;
  const id = m[1];
  img.removeAttribute("src"); img.style.background = "#E9EBE6"; img.dataset.whBlob = id;
  loadInto(img, id);
}
function watchImages() {
  const scan = root => root.querySelectorAll && root.querySelectorAll('img[src*="/_blob/"]').forEach(hydrate);
  new MutationObserver(ms => ms.forEach(m => {
    m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.tagName === "IMG") hydrate(n); scan(n); } });
    if (m.type === "attributes" && m.target.tagName === "IMG") hydrate(m.target);
  })).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  scan(document);
}

/* ---------------- utilisateurs ---------------- */
const userApi = {
  id: async () => currentUser?.uid || null,
  me: async () => ({ id: currentUser?.uid }),
  isOwner: () => false, canEdit: () => true, can: () => true,
  profiles: async (ids) => {
    const out = {};
    await Promise.all(ids.map(async id => { try { const s = await getDoc(doc(fs, "users", id)); out[id] = { name: s.exists() ? (s.data().name || "") : "" }; } catch (e) { out[id] = { name: "" }; } }));
    return out;
  },
};

/* ---------------- export (fichier pour Excel, partagé par WhatsApp, e-mail…) ---------------- */
const downloadsApi = {
  save: async ({ filename, data }) => {
    const text = typeof data === "string" ? data : await data.text();
    const r = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, files: [r.uri], dialogTitle: "Envoyer le fichier" });
    return { status: "delivered" };
  },
};

/* ---------------- caméra en direct ---------------- */
function openCamera(title) {
  return new Promise(async (resolve) => {
    let stream = null, facing = "environment";
    const el = document.createElement("div"); el.className = "wh-cam";
    el.innerHTML = `<video playsinline autoplay muted></video><div class="flash"></div>
      <div class="top"><span>📷 ${title || "Photo"}</span><span id="wh-clock"></span></div>
      <div class="bar"><button class="ic" data-x="close" aria-label="Fermer">✕</button><button class="shoot" data-x="shoot" aria-label="Prendre la photo"></button><button class="ic" data-x="flip" aria-label="Changer de caméra">🔄</button></div>`;
    document.body.appendChild(el);
    const video = el.querySelector("video");
    const clock = el.querySelector("#wh-clock");
    const tick = setInterval(() => { const d = new Date(); clock.textContent = d.toLocaleDateString("fr-FR") + " " + String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0"); }, 1000);
    const stop = () => { stream && stream.getTracks().forEach(t => t.stop()); stream = null; };
    const done = (file) => { clearInterval(tick); stop(); el.remove(); resolve(file); };
    async function start() {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        video.srcObject = stream; await video.play().catch(() => {});
      } catch (e) { done("fallback"); }
    }
    el.addEventListener("click", async (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x; if (!x) return;
      if (x === "close") done(null);
      else if (x === "flip") { facing = facing === "environment" ? "user" : "environment"; start(); }
      else if (x === "shoot") {
        const c = document.createElement("canvas"); c.width = video.videoWidth || 1280; c.height = video.videoHeight || 720;
        c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
        const fl = el.querySelector(".flash"); fl.style.opacity = ".8"; setTimeout(() => (fl.style.opacity = "0"), 120);
        const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
        stop();
        // aperçu : garder ou reprendre
        const url = URL.createObjectURL(blob);
        video.replaceWith(Object.assign(document.createElement("img"), { src: url, alt: "Aperçu" }));
        el.querySelector(".bar").innerHTML = `<button class="txt no" data-y="again">↺ Reprendre</button><button class="txt ok" data-y="use">✓ Utiliser la photo</button>`;
        el.querySelector(".bar").onclick = (ev) => {
          const y = ev.target.closest("[data-y]")?.dataset.y; if (!y) return;
          if (y === "use") done(new File([blob], "photo-" + Date.now() + ".jpg", { type: "image/jpeg", lastModified: Date.now() }));
          else { el.remove(); clearInterval(tick); URL.revokeObjectURL(url); openCamera(title).then(resolve); }
        };
      }
    });
    start();
  });
}
window.__whCamera = openCamera;
function interceptCameraInputs() {
  // Les boutons « Prendre une photo » de l'application ouvrent la caméra en direct au lieu du sélecteur de fichiers.
  document.addEventListener("click", async (e) => {
    const label = e.target.closest("label"); if (!label) return;
    const input = label.querySelector('input[type="file"][capture]'); if (!input) return;
    if (!navigator.mediaDevices?.getUserMedia) return; // pas de caméra en direct : comportement normal
    e.preventDefault(); e.stopPropagation();
    const title = input.id === "snap-v" ? "Plat vendu" : input.id === "snap-a" ? "Achat" : (document.querySelector(".sheet h3")?.textContent || "Photo");
    const file = await openCamera(title);
    if (file === "fallback") { input.removeAttribute("capture"); input.click(); setTimeout(() => input.setAttribute("capture", "environment"), 500); return; }
    if (!file) return;
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, true);
}

/* ---------------- compte + import du cahier (onglet Carte) ---------------- */
let hasData = null;
let diagList = null, testMsg = "";
const esc2 = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ago = t => { if (!t) return "jamais"; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "à l'instant" : m < 60 ? "il y a " + m + " min" : m < 1440 ? "il y a " + Math.round(m / 60) + " h" : "il y a " + Math.round(m / 1440) + " j"; };
async function loadDiag() { try { const s = await getDocs(collection(fs, "diag")); diagList = s.docs.map(d => d.data()).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)); } catch (e) { diagList = []; setState("error", explain(e)); } window.__rerender && window.__rerender(); }
window.__extraCarte = () => {
  if (!currentUser) return "";
  if (diagList === null) { diagList = []; loadDiag(); }
  const imp = hasData === false ? `<button class="btn primary" style="width:100%;margin-top:10px" data-wh="import">📥 Importer le cahier du 26/08 au 25/09/2026</button>` : "";
  const col = ST.state === "ok" ? "#1F7A4D" : ST.state === "error" ? "#B42318" : "#9A6400";
  const lbl = { ok: "✓ Synchronisé avec le serveur", sending: "Envoi en cours…", offline: "Hors ligne : tout est enregistré sur ce téléphone et partira au retour d'internet", error: "Pas synchronisé", init: "Connexion au serveur…" }[ST.state];
  const people = (diagList || []).map(d => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:13.5px;padding:4px 0"><span>👤 <b>${esc2(d.name || d.email || "?")}</b> <span style="color:#5E6862">${esc2(d.email || "")}</span></span><span style="color:#5E6862;white-space:nowrap">${ago(d.lastSeen)}</span></div>`).join("");
  return `<h2 class="sec" id="wh-diag">Synchronisation</h2><div class="list" style="padding:12px 14px">
    <div style="font-weight:800;color:${col}">${lbl}</div>
    ${waiting() ? `<div style="font-size:13.5px;color:#9A6400;margin-top:6px">${waiting()} saisie(s) en attente d'envoi — elles sont gardées sur ce téléphone, même s'il est éteint.</div>` : ""}
    ${ST.msg ? `<div style="font-size:13.5px;color:#B42318;margin-top:6px">${esc2(ST.msg)}</div>` : ""}
    <div style="font-size:13px;color:#5E6862;margin-top:6px">Dernier contact avec le serveur : ${ago(ST.lastServer)}${ST.size != null ? " · " + ST.size + " jours enregistrés" : ""}</div>
    <div style="font-size:12px;font-weight:800;color:#5E6862;text-transform:uppercase;letter-spacing:.08em;margin-top:12px">Téléphones reliés à la même caisse</div>
    ${people || `<div style="font-size:13.5px;color:#5E6862">Aucun pour l'instant.</div>`}
    <button class="btn ghost small" style="margin-top:10px" data-wh="test">🔄 Tester la synchronisation</button>
    ${testMsg ? `<div style="font-size:13.5px;margin-top:8px">${testMsg}</div>` : ""}
  </div>
  <h2 class="sec">Compte</h2><div class="list" style="padding:12px 14px">
    <div style="font-size:14px">Connecté : <b>${esc2(currentUser.email || "")}</b></div>
    <button class="btn ghost small" style="margin-top:10px" data-wh="logout">Se déconnecter</button>${imp}</div>`;
};
async function runTest() {
  testMsg = "Test en cours…"; window.__rerender && window.__rerender();
  try {
    const ref = doc(fs, "diag", currentUser.uid); const stamp = Date.now();
    await Promise.race([setDoc(ref, { test: stamp, lastSeen: stamp, name: localStorage.getItem("wh-name") || "", email: currentUser.email || "" }, { merge: true }), new Promise((_, ko) => setTimeout(() => ko({ code: "unavailable", message: "délai dépassé" }), 12000))]);
    const back = await getDocFromServer(ref);
    if (back.exists() && back.data().test === stamp) { testMsg = `<b style="color:#1F7A4D">✓ Tout fonctionne : ce téléphone écrit et lit bien sur le serveur. Les autres téléphones connectés voient les mêmes données.</b>`; setState("ok"); }
    else testMsg = `<b style="color:#B42318">Réponse inattendue du serveur.</b>`;
  } catch (e) { testMsg = `<b style="color:#B42318">✗ ${esc2(explain(e))}</b>`; setState("error", explain(e)); }
  await loadDiag();
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-wh]"); if (!b) return;
  if (b.dataset.wh === "logout") { if (b.dataset.sure) { await signOut(auth); location.reload(); } else { b.dataset.sure = "1"; b.textContent = "Confirmer la déconnexion ?"; } }
  if (b.dataset.wh === "test") runTest();
  if (b.dataset.wh === "import") {
    b.disabled = true; b.textContent = "Import en cours…";
    try {
      const batch = writeBatch(fs);
      for (const [id, d] of Object.entries(SEED.jours)) batch.set(doc(fs, "jours", id), d, { merge: true });
      batch.set(doc(fs, "config", "tarifs"), SEED.tarifs, { merge: true });
      await batch.commit(); hasData = true; b.textContent = "✓ Cahier importé"; window.__rerender && window.__rerender();
    } catch (ex) { b.disabled = false; b.textContent = "Échec — réessayer"; setState("error", explain(ex)); testMsg = `<b style="color:#B42318">✗ Import impossible : ${esc2(explain(ex))}</b>`; window.__rerender && window.__rerender(); }
  }
});

/* ---------------- démarrage ---------------- */
function missingConfig() {
  document.addEventListener("DOMContentLoaded", () => {
    const el = document.createElement("div"); el.className = "wh-login";
    el.innerHTML = `<div class="wh-card"><div class="wh-logo">${LOGO}</div><h1>WON HOUSE</h1><p>Configuration Firebase manquante.<br>Cette version de l'application n'est pas encore reliée à la base de données du restaurant.</p></div>`;
    document.body.appendChild(el);
  });
}
document.addEventListener("DOMContentLoaded", () => { addCss(); if (cfg) { watchImages(); interceptCameraInputs(); } });

if (!cfg || !cfg.apiKey) {
  addCss(); missingConfig();
  window.claude = { use: async () => null };
} else {
  app = initializeApp(cfg);
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: 200 * 1024 * 1024 }) });
  onAuthStateChanged(auth, async (u) => {
    currentUser = u;
    if (u) {
      hideLogin(); readyResolve(true);
      watchStatus();
    } else {
      const show = () => showLogin();
      document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", show) : show();
    }
  });
  const table = { db: dbApi, assets: assetsApi, user: userApi, downloads: downloadsApi };
  window.claude = { use: async (name) => { await ready; return table[name] || null; } };
}
