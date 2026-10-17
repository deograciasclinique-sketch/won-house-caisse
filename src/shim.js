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
  doc, collection, getDoc, getDocs, getDocFromServer, getDocsFromServer, disableNetwork, enableNetwork, setDoc, deleteDoc, onSnapshot, writeBatch, limit, query,
  orderBy, terminate, clearIndexedDbPersistence,
} from "firebase/firestore";
import QRCode from "qrcode";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { registerPlugin, Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import SEED from "./seed.json";

const cfg = window.FIREBASE_CONFIG;
let app = null, auth = null, fs = null, currentUser = null;
let readyResolve; const ready = new Promise(r => (readyResolve = r));

/* ---------------- écran de connexion ---------------- */
const CSS = `
.wh-login{position:fixed;inset:0;z-index:100;overflow:auto;background:#160B0D;background-image:radial-gradient(120% 70% at 0% 0%,rgba(184,53,42,.55),transparent 60%),radial-gradient(90% 60% at 100% 100%,rgba(227,154,30,.35),transparent 60%);display:flex;align-items:center;justify-content:center;padding:calc(20px + env(safe-area-inset-top,0px)) 18px calc(20px + env(safe-area-inset-bottom,0px));font-family:"Nunito Sans",system-ui,sans-serif}
.wh-card{background:#fff;color:#1B211E;border-radius:26px;padding:26px 20px 18px;width:100%;max-width:390px;box-shadow:0 30px 60px rgba(0,0,0,.45)}
.wh-card h1{font:800 24px/1.1 "Sora",system-ui,sans-serif;letter-spacing:.06em;margin:14px 0 2px;text-align:center}
.wh-card p{color:#5E6862;text-align:center;margin:0 0 14px;font-size:14px}
.wh-secure{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 auto 6px;width:max-content;padding:5px 11px;border-radius:99px;background:#E1F1E8;color:#1F7A4D;font-size:12px;font-weight:800;letter-spacing:.02em}
.wh-card label{display:block;font-size:12px;font-weight:700;color:#5E6862;text-transform:uppercase;letter-spacing:.08em;margin:14px 0 6px}
.wh-card input{width:100%;box-sizing:border-box;border:1.5px solid #D7DBD4;background:#F7F8F5;border-radius:14px;padding:14px;font-size:16px;color:#1B211E;transition:border-color .15s,background .15s}
.wh-card input:focus{outline:0;border-color:#B8352A;background:#fff}
.wh-pw{position:relative}.wh-pw input{padding-right:58px}
.wh-card .wh-eye{box-shadow:none;position:absolute;right:6px;top:50%;transform:translateY(-50%);width:auto;margin:0;padding:8px 10px;border-radius:10px;background:transparent;color:#8C1D2B;font-size:13px;font-weight:800}
.wh-card button{width:100%;margin-top:20px;border:0;border-radius:16px;padding:16px;font-size:16px;font-weight:800;color:#fff;background:linear-gradient(135deg,#7A1726,#B8352A 55%,#E39A1E);box-shadow:0 10px 22px rgba(140,29,43,.3)}
.wh-card button:disabled{opacity:.6}
.wh-card .err{color:#B42318;font-size:13.5px;text-align:center;margin-top:12px;min-height:18px}
.wh-card .link{background:none;box-shadow:none;color:#8C1D2B;font-weight:700;font-size:13.5px;padding:8px;margin-top:4px}
.wh-foot{text-align:center;color:#8A928D;font-size:11.5px;margin-top:6px}
.wh-logo{width:76px;height:76px;border-radius:24px;margin:0 auto;display:grid;place-items:center;background:linear-gradient(135deg,#7A1726,#B8352A 55%,#E39A1E);box-shadow:0 12px 26px rgba(140,29,43,.35)}
/* verrou par code secret */
.wh-lock{position:fixed;inset:0;z-index:150;background:#160B0D;background-image:radial-gradient(110% 60% at 50% -10%,rgba(184,53,42,.6),transparent 65%);color:#FBF4EE;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:calc(24px + env(safe-area-inset-top,0px)) 24px calc(24px + env(safe-area-inset-bottom,0px));font-family:"Nunito Sans",system-ui,sans-serif;user-select:none;-webkit-user-select:none}
.wh-lock h2{font:800 21px/1.2 "Sora",system-ui,sans-serif;margin:16px 0 4px;text-align:center}
.wh-lock p{margin:0;color:#D9C9C2;font-size:14px;text-align:center;min-height:20px}
.wh-lock .who{font-size:12.5px;color:#B9A49C;margin-top:2px}
.wh-dots{display:flex;gap:16px;margin:26px 0 8px}
.wh-dots i{width:15px;height:15px;border-radius:50%;border:2px solid rgba(255,255,255,.55);transition:background .12s,transform .12s}
.wh-dots i.on{background:#F2C46B;border-color:#F2C46B;transform:scale(1.1)}
.wh-dots.shake{animation:whShake .4s}
@keyframes whShake{20%,60%{transform:translateX(-9px)}40%,80%{transform:translateX(9px)}}
.wh-pad{display:grid;grid-template-columns:repeat(3,76px);gap:14px 22px;margin-top:18px}
.wh-pad button{width:76px;height:76px;border-radius:50%;border:0;background:rgba(255,255,255,.09);color:#fff;font:700 27px "Sora",system-ui,sans-serif;display:grid;place-items:center}
.wh-pad button:active{background:rgba(255,255,255,.25)}
.wh-pad button.t{background:transparent;font:700 14px "Nunito Sans",system-ui,sans-serif;color:#E9D7CF}
.wh-lock .wh-out{margin-top:22px;background:none;border:0;color:#F2C46B;font-weight:800;font-size:14px;padding:10px}
.wh-lock .err{color:#FFB4A8}
/* équipe et accès */
.wh-sec{padding:12px 14px}
.wh-alarm{background:#FBE7E4;color:#7A1D14;border-radius:14px;padding:12px;font-size:14px;line-height:1.4}
.wh-safe{background:#E1F1E8;color:#14532D;border-radius:14px;padding:10px 12px;font-size:14px;font-weight:700}
.wh-mem{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line,#D7DBD4)}
.wh-mem:first-child{border-top:0}
.wh-mem .e{flex:1;min-width:0;overflow-wrap:anywhere;font-size:14px;font-weight:700}
.wh-mem .e small{display:block;font-weight:600;color:var(--muted,#5E6862);font-size:12px}
.wh-role{font-size:11.5px;font-weight:800;padding:4px 9px;border-radius:99px;background:var(--surface-2,#E9EBE6);white-space:nowrap;border:0;color:inherit}
.wh-role.p{background:#7A1726;color:#fff}
.wh-x{width:34px;height:34px;border-radius:10px;border:1px solid var(--line,#D7DBD4);background:transparent;color:var(--bad,#B42318);font-weight:800}
.wh-add{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.wh-add input{flex:1 1 180px;min-width:0;border:1px solid var(--line,#D7DBD4);background:var(--bg,#F3F4F1);border-radius:12px;padding:11px;font-size:15px;color:inherit}
.wh-add select{border:1px solid var(--line,#D7DBD4);background:var(--bg,#F3F4F1);border-radius:12px;padding:11px;font-size:14px;color:inherit}
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
  try { if (!message) { message = sessionStorage.getItem("wh-msg") || ""; sessionStorage.removeItem("wh-msg"); } } catch (e) {}
  el.innerHTML = `<form class="wh-card" autocomplete="on">
    <div class="wh-logo">${LOGO}</div>
    <h1>WON HOUSE</h1><p>Caisse et commandes du restaurant</p>
    <div class="wh-secure">🔒 Accès réservé à l'équipe</div>
    <label for="wh-email">E-mail</label><input id="wh-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required>
    <label for="wh-pass">Mot de passe</label><div class="wh-pw"><input id="wh-pass" type="password" autocomplete="current-password" required><button type="button" class="wh-eye" id="wh-eye" aria-label="Afficher le mot de passe">Voir</button></div>
    <label for="wh-name">Votre prénom</label><input id="wh-name" placeholder="ex. Awa" autocomplete="given-name" maxlength="30">
    <button type="submit" id="wh-go">Se connecter</button>
    <div class="err" id="wh-err" role="alert">${esc2(message || "")}</div>
    <button type="button" class="link" id="wh-forgot">Mot de passe oublié ?</button>
    <div class="wh-foot">Connexion chiffrée · un code secret protège ensuite ce téléphone</div>
  </form>`;
  document.body.appendChild(el);
  document.getElementById("wh-eye").addEventListener("click", (e) => { const p = document.getElementById("wh-pass"); const v = p.type === "password"; p.type = v ? "text" : "password"; e.target.textContent = v ? "Cacher" : "Voir"; });
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
// Miniatures des photos de plats (onglet Carte) : <img data-dp="photo-…">
async function loadDish(img) {
  const k = img.dataset.dp; if (!k || img.dataset.dpOk === k) return;
  if (!photoCache[k]) { try { const s = await getDoc(doc(fs, "public", k)); if (s.exists()) photoCache[k] = s.data().data; } catch (e) {} }
  if (photoCache[k]) { img.src = photoCache[k]; img.dataset.dpOk = k; }
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
  const scan = root => { if (!root.querySelectorAll) return; root.querySelectorAll('img[src*="/_blob/"]').forEach(hydrate); root.querySelectorAll("img[data-dp]").forEach(loadDish); };
  new MutationObserver(ms => ms.forEach(m => {
    m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.tagName === "IMG") { hydrate(n); if (n.dataset.dp) loadDish(n); } scan(n); } });
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

/* ---------------- notifications (application en arrière-plan) ----------------
   Quand l'application n'est pas à l'écran, une notification Android avec son
   prévient le gestionnaire d'une nouvelle commande ou d'un paiement à vérifier. */
let notifPret = null;
function preparerNotif() {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(false);
  if (!notifPret) notifPret = (async () => {
    try {
      let p = await LocalNotifications.checkPermissions();
      if (p.display !== "granted") p = await LocalNotifications.requestPermissions();
      try {
        await LocalNotifications.createChannel({ id: "commandes", name: "Commandes clients", description: "Sonnerie à chaque commande et paiement", importance: 5, visibility: 1, vibration: true });
      } catch (e) {}
      return p.display === "granted";
    } catch (e) { return false; }
  })();
  return notifPret;
}
preparerNotif();
window.__whNotify = (title, body) => {
  preparerNotif().then((ok) => {
    if (!ok) return;
    LocalNotifications.schedule({ notifications: [{ id: Math.floor(Date.now() % 2000000000), title, body, channelId: "commandes" }] }).catch(() => {});
  });
};

/* ---------------- répertoire des clients et contacts ----------------
   Collection « repertoire » (réservée à l'équipe) : une fiche par numéro de téléphone.
   Remplie toute seule à chaque commande client, et complétée à la main par l'équipe. */
window.__whRepertoire = {
  watch: (next) => (fs && currentUser ? onSnapshot(collection(fs, "repertoire"), s => {
    const out = {}; s.docs.forEach(d => { out[d.id] = d.data(); }); next(out);
  }, () => next(null)) : () => {}),
  save: (key, data) => write(() => setDoc(doc(fs, "repertoire", key), { ...data, majAt: Date.now(), majBy: currentUser?.uid || null }, { merge: true })),
};

/* ---------------- rappel du matin : choisir le menu du jour ----------------
   Chaque matin à 7 h 30, une notification rappelle de choisir le menu du jour.
   Programmée pour les 14 prochains jours (reprogrammée à chaque ouverture) ;
   pas de rappel le jour même si le menu du jour est déjà choisi. */
const RAPPEL_BASE = 7300, RAPPEL_JOURS = 14;
let rappelSig = "";
window.__whRappelJour = (dejaChoisi) => {
  preparerNotif().then(async (ok) => {
    if (!ok) return;
    const now = new Date();
    const sig = now.toDateString() + "|" + (dejaChoisi ? 1 : 0);
    if (sig === rappelSig) return; rappelSig = sig;
    try {
      try { await LocalNotifications.createChannel({ id: "rappels", name: "Rappel du menu du jour", description: "Chaque matin à 7 h 30", importance: 4, visibility: 1, vibration: true }); } catch (e) {}
      const ids = []; for (let k = 0; k <= RAPPEL_JOURS; k++) ids.push({ id: RAPPEL_BASE + k });
      await LocalNotifications.cancel({ notifications: ids }).catch(() => {});
      const list = [];
      for (let k = 0; k <= RAPPEL_JOURS; k++) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 7, 30, 0);
        if (at <= now) continue;
        if (k === 0 && dejaChoisi) continue;
        list.push({ id: RAPPEL_BASE + k, title: "☀️ Menu du jour WON HOUSE", body: "Bonjour ! Choisissez les plats du jour : les clients les verront en grand dès qu'ils ouvrent le menu.", channelId: "rappels", schedule: { at, allowWhileIdle: true }, extra: { tab: "commandes" } });
      }
      if (list.length) await LocalNotifications.schedule({ notifications: list });
    } catch (e) {}
  });
};
if (Capacitor.isNativePlatform()) {
  LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
    const tab = a && a.notification && a.notification.extra && a.notification.extra.tab;
    if (!tab) return;
    const go = () => { const b = document.querySelector(`.tabs [data-tab="${tab}"]`); if (b) { b.click(); setTimeout(() => { const h = [...document.querySelectorAll("h2.sec")].find(x => x.textContent.trim() === "Menu du jour"); h && h.scrollIntoView({ behavior: "smooth" }); }, 400); } };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => setTimeout(go, 800)) : setTimeout(go, 300);
  }).catch(() => {});
}

/* ---------------- envoyer l'application (WhatsApp) ---------------- */
const AppShare = registerPlugin("AppShare");
const APK_LINK = "https://github.com/deograciasclinique-sketch/won-house-caisse/releases/latest/download/WON-HOUSE-caisse.apk";
const HOWTO = "Pour installer : ouvrir le fichier, autoriser « installer des applications inconnues », puis Installer.";
window.__whApp = {
  native: Capacitor.isNativePlatform(),
  link: APK_LINK,
  // envoie le fichier APK de l'application installée (marche sans internet sur ce téléphone)
  shareApk: () => AppShare.shareApk({ text: "📲 Application WON HOUSE — caisse du restaurant.\n" + HOWTO }),
  // envoie un message avec le lien de téléchargement de la dernière version
  shareLink: () => {
    const text = "📲 Application WON HOUSE — caisse du restaurant.\nTélécharger : " + APK_LINK + "\n" + HOWTO;
    if (Capacitor.isNativePlatform()) return AppShare.shareText({ text });
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank"); return Promise.resolve();
  },
  version: () => (Capacitor.isNativePlatform() ? AppShare.getVersion().catch(() => null) : Promise.resolve(null)),
};

/* ---------------- commandes des clients + menu public ----------------
   « public/menu » : ce que voient les clients (plats, prix, plats épuisés, commandes ouvertes).
   « commandes » : créées par les clients depuis la page client, suivies ici par l'équipe. */
const CLIENT_URL = "https://deograciasclinique-sketch.github.io/won-house-caisse/";
window.__whOrders = {
  url: CLIENT_URL,
  // dernières commandes, mises à jour en direct
  watch: (next) => {
    if (!fs || !currentUser) return () => {};
    const q = query(collection(fs, "commandes"), orderBy("at", "desc"), limit(80));
    return onSnapshot(q, s => {
      const list = s.docs.map(d => { const o = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...o, at: o.at && o.at.toMillis ? o.at.toMillis() : Date.now() }; });
      const added = s.docChanges().filter(c => c.type === "added" && !c.doc.metadata.hasPendingWrites).map(c => c.doc.id);
      next(list, added, s.metadata.fromCache);
    }, e => { setState("error", explain(e)); next(null, [], true, explain(e)); });
  },
  update: (id, data) => write(() => setDoc(doc(fs, "commandes", id), { ...data, majAt: Date.now(), majBy: currentUser?.uid || null }, { merge: true })),
  // position actuelle du téléphone (pour enregistrer la position du restaurant)
  position: () => new Promise((ok, ko) => {
    if (!navigator.geolocation) return ko(new Error("Localisation indisponible sur ce téléphone."));
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy || 0) }),
      e => ko(new Error(e && e.code === 1 ? "Localisation refusée : autorisez-la pour WON HOUSE dans les réglages du téléphone." : "Position introuvable : activez le GPS puis réessayez.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }),
  setStatut: (id, statut, extra) => write(() => setDoc(doc(fs, "commandes", id), { statut, ...(extra || {}), majAt: Date.now(), majBy: currentUser?.uid || null }, { merge: true })),
  // « null » seulement si le serveur confirme que le menu n'existe pas encore (jamais d'après le seul cache hors ligne).
  watchMenu: (next) => (fs && currentUser ? onSnapshot(doc(fs, "public", "menu"), { includeMetadataChanges: true }, s => {
    if (!s.exists() && s.metadata.fromCache) return;
    next(s.exists() ? s.data() : null);
  }, () => next(undefined)) : () => {}),
  publishMenu: (menu) => write(() => setDoc(doc(fs, "public", "menu"), { ...menu, majAt: Date.now() }, { merge: true })),
  // Photo d'un plat pour le menu des clients : recadrée en carré, réduite à 640 px,
  // rangée dans « public/photo-… » (lisible par les clients, modifiable par l'équipe seulement).
  dishPhoto: async (blob) => {
    const img = await createImageBitmap(blob);
    const s = Math.min(img.width, img.height);
    const c = document.createElement("canvas"); c.width = c.height = Math.min(640, s);
    c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", 0.72);
    const key = "photo-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    photoCache[key] = data;
    await write(() => setDoc(doc(fs, "public", key), { data, at: Date.now() }));
    return key;
  },
  dropDishPhoto: (key) => (/^photo-[a-z0-9]+$/.test(key || "") ? write(() => deleteDoc(doc(fs, "public", key))) : Promise.resolve()),
  qr: (text) => QRCode.toDataURL(text, { margin: 1, width: 480, color: { dark: "#3A0B12", light: "#FFFFFF" } }),
  share: (text) => {
    if (Capacitor.isNativePlatform()) return AppShare.shareText({ text });
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank"); return Promise.resolve();
  },
};

/* ---------------- tirer vers le bas : actualiser + vérifier la mise à jour ---------------- */
const REPO_API = "https://api.github.com/repos/deograciasclinique-sketch/won-house-caisse/releases/latest";
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko({ code: "unavailable", message: "délai dépassé" }), ms))]);
async function checkUpdate() {
  if (!Capacitor.isNativePlatform() || navigator.onLine === false) return null;
  try {
    const cur = await AppShare.getVersion();
    const r = await withTimeout(fetch(REPO_API, { cache: "no-store" }), 10000);
    if (!r.ok) return null;
    const rel = await r.json();
    const latest = Number(String(rel.tag_name || "").split(".").pop()) || 0;
    const mine = Number(cur && cur.build) || 0;
    const asset = (rel.assets || []).find(a => /\.apk$/i.test(a.name));
    if (latest > mine && asset) return { version: rel.tag_name, url: asset.browser_download_url };
  } catch (e) {}
  return null;
}
window.__whCheckUpdate = checkUpdate;
window.__whOpenUrl = (url) => (Capacitor.isNativePlatform() ? AppShare.openUrl({ url }) : Promise.resolve(window.open(url, "_blank")));
window.__whRefresh = async () => {
  if (!fs || !currentUser) return { ok: false, msg: "Connectez-vous d'abord." };
  if (navigator.onLine === false) { setState("offline"); return { ok: false, offline: true, msg: waiting() ? `Hors ligne : ${waiting()} saisie(s) gardée(s) sur ce téléphone, envoi au retour d'internet.` : "Hors ligne : pas de mise à jour possible pour l'instant." }; }
  try {
    // relance la connexion au serveur (débloque une connexion figée)
    await disableNetwork(fs); await enableNetwork(fs);
    setState(waiting() ? "sending" : "init");
    // 1) envoyer ce qui attend sur ce téléphone
    await withTimeout(waitForPendingWrites(fs), 15000).catch(() => {});
    // 2) recevoir les dernières données des autres téléphones
    const s = await withTimeout(getDocsFromServer(collection(fs, "jours")), 15000);
    await withTimeout(getDocFromServer(doc(fs, "config", "tarifs")), 10000).catch(() => {});
    ST.lastServer = Date.now(); ST.size = s.size; hasData = s.size > 0;
    oldPending = 0; if (!pending) savePending();
    setState(waiting() ? "sending" : "ok");
    retryImages(); loadDiag();
    const update = await checkUpdate();
    return { ok: true, msg: waiting() ? `Données à jour · ${waiting()} saisie(s) encore en envoi` : "✓ Données à jour", update };
  } catch (e) {
    if (isOffline(e)) { setState("offline"); return { ok: false, offline: true, msg: "Serveur injoignable : vérifiez internet. Vos saisies restent gardées sur ce téléphone." }; }
    setState("error", explain(e)); return { ok: false, msg: explain(e) };
  }
};

/* ---------------- caméra en direct ---------------- */
function openCamera(title) {
  return new Promise(async (resolve) => {
    let stream = null, facing = "environment";
    const el = document.createElement("div"); el.className = "wh-cam";
    el.innerHTML = `<video playsinline autoplay muted></video><div class="flash"></div>
      <div class="top"><span>📷 ${title || "Photo"}</span><span id="wh-clock"></span></div>
      <div class="bar"><button class="ic" data-x="close" aria-label="Fermer">✕</button><button class="ic" data-x="gallery" aria-label="Choisir une photo dans la galerie">🖼</button><button class="shoot" data-x="shoot" aria-label="Prendre la photo"></button><button class="ic" data-x="flip" aria-label="Changer de caméra">🔄</button></div>`;
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
      else if (x === "gallery") {
        // Photo déjà téléchargée sur le téléphone (WhatsApp, Internet, galerie…)
        const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
        inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) done(f); };
        inp.click();
      }
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
  return equipeHTML() + `<h2 class="sec" id="wh-diag">Synchronisation</h2><div class="list" style="padding:12px 14px">
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
    <p style="font-size:12.5px;color:var(--muted);margin:6px 0 0">Se déconnecter efface aussi la copie de la caisse gardée sur ce téléphone.</p>
    <button class="btn ghost small danger" style="margin-top:10px" data-wh="logout">Se déconnecter de ce téléphone</button>${imp}</div>`;
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
  if (["lock-now", "pin-change", "proteger", "ajouter", "role", "retirer"].includes(b.dataset.wh)) { actionEquipe(b); return; }
  if (b.dataset.wh === "logout") {
    if (b.dataset.sure) effacerTelephone("Vous êtes déconnecté. Les données de ce téléphone ont été effacées.");
    else { b.dataset.sure = "1"; b.textContent = waiting() ? `⚠ ${waiting()} saisie(s) pas encore envoyée(s) seront perdues. Confirmer ?` : "Confirmer la déconnexion ?"; }
  }
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

/* ================= SÉCURITÉ =================
   1) Équipe autorisée : document « acces/equipe » = { membres: { email: "proprietaire" | "gestionnaire" } }.
      Les règles Firestore refusent tout compte absent de la liste. Si un compte est retiré,
      ce téléphone est vidé et déconnecté aussitôt.
   2) Code secret à 4 chiffres sur chaque téléphone : demandé à l'ouverture et après 2 min hors de l'application.
   3) Déconnexion = effacement des données gardées sur le téléphone. */
const ACCES = { pret: false, protege: false, membres: {}, role: "" };
const monEmail = () => String(currentUser?.email || "").toLowerCase();
let stopAcces = null;
function watchAcces() {
  stopAcces && stopAcces();
  stopAcces = onSnapshot(doc(fs, "acces", "equipe"), { includeMetadataChanges: true }, (s) => {
    if (!s.exists()) {
      if (s.metadata.fromCache && !ACCES.pret) return; // on attend la réponse du serveur
      Object.assign(ACCES, { pret: true, protege: false, membres: {}, role: "proprietaire" });
    } else {
      const m = (s.data() || {}).membres || {};
      Object.assign(ACCES, { pret: true, protege: true, membres: m, role: m[monEmail()] || "" });
      if (!ACCES.role && !s.metadata.fromCache) return effacerTelephone("Ce compte ne fait plus partie de l'équipe WON HOUSE. Les données de ce téléphone ont été effacées. Demandez au propriétaire de vous ajouter.");
    }
    window.__rerender && window.__rerender();
  }, (e) => {
    if (e && e.code === "permission-denied") effacerTelephone("Ce compte n'a pas accès à la caisse WON HOUSE. Demandez au propriétaire de vous ajouter dans « Équipe et accès ».");
  });
}
window.__whAcces = ACCES;

// Déconnexion complète : plus de session, plus de copie des données sur ce téléphone.
let effacement = false;
async function effacerTelephone(msg) {
  if (effacement) return; effacement = true;
  try { if (msg) sessionStorage.setItem("wh-msg", msg); } catch (e) {}
  try { await signOut(auth); } catch (e) {}
  try { await terminate(fs); await clearIndexedDbPersistence(fs); } catch (e) {}
  try { Object.keys(localStorage).filter(k => /^(wh-|wonhouse-|whp-)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  location.reload();
}

/* ---------- code secret ---------- */
const LOCK = { el: null, hiddenAt: 0, apres: 2 * 60 * 1000 };
const pinKey = () => "wh-pin-" + (currentUser?.uid || "");
const triesKey = () => "wh-pintry-" + (currentUser?.uid || "");
const lireJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const ecrireJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const pinDispo = () => !!(window.crypto && crypto.subtle && window.TextEncoder);
async function pinHash(pin, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt + "|" + (currentUser?.uid || "")), iterations: 150000, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const aUnCode = () => !!lireJSON(pinKey());
function prenom() { try { return localStorage.getItem("wh-name") || ""; } catch (e) { return ""; } }

// mode : "creer" (nouveau code, deux fois), "ouvrir" (déverrouiller), "changer" (nouveau code depuis l'application)
function ouvrirVerrou(mode) {
  if (!pinDispo() || !currentUser) return;
  if (LOCK.el) { if (mode === "creer" || LOCK.el.dataset.mode === mode) return; LOCK.el.remove(); }
  let saisie = "", premier = "", etape = mode === "ouvrir" ? "ouvrir" : "nouveau";
  const el = document.createElement("div"); el.className = "wh-lock"; el.dataset.mode = mode; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
  const titre = () => etape === "ouvrir" ? `Bonjour${prenom() ? " " + esc2(prenom()) : ""} 👋` : etape === "nouveau" ? (mode === "changer" ? "Nouveau code secret" : "Créez votre code secret") : "Confirmez le code";
  const sous = () => etape === "ouvrir" ? "Tapez votre code secret pour ouvrir la caisse" : etape === "nouveau" ? "4 chiffres, à ne donner à personne. Il protège ce téléphone." : "Tapez le même code une deuxième fois";
  el.innerHTML = `<div class="wh-logo">${LOGO}</div><h2 id="wh-lt"></h2><p id="wh-ls"></p><div class="who">${esc2(currentUser.email || "")}</div>
    <div class="wh-dots" id="wh-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="err" id="wh-le" role="alert"></p>
    <div class="wh-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join("")}<button type="button" class="t" data-k="x">${mode === "changer" ? "Annuler" : ""}</button><button type="button" data-k="0">0</button><button type="button" class="t" data-k="del" aria-label="Effacer">⌫</button></div>
    ${mode === "ouvrir" ? `<button type="button" class="wh-out" data-k="oubli">Code oublié ? Se reconnecter</button>` : ""}`;
  document.body.appendChild(el); LOCK.el = el;
  const maj = (err) => {
    el.querySelector("#wh-lt").innerHTML = titre(); el.querySelector("#wh-ls").textContent = sous();
    el.querySelectorAll("#wh-dots i").forEach((d, i) => d.classList.toggle("on", i < saisie.length));
    el.querySelector("#wh-le").textContent = err || "";
  };
  const secoue = (err) => { const d = el.querySelector("#wh-dots"); d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake"); try { navigator.vibrate && navigator.vibrate(180); } catch (e) {} saisie = ""; maj(err); };
  const fermer = () => { el.remove(); if (LOCK.el === el) LOCK.el = null; };
  async function valider() {
    if (etape === "nouveau") {
      if (/^(\d)\1{3}$/.test(saisie) || ["1234", "4321", "0123", "2580", "1212"].includes(saisie)) return secoue("Code trop facile à deviner. Choisissez-en un autre.");
      premier = saisie; saisie = ""; etape = "confirmer"; return maj();
    }
    if (etape === "confirmer") {
      if (saisie !== premier) { etape = "nouveau"; premier = ""; return secoue("Les deux codes sont différents. Recommencez."); }
      const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
      ecrireJSON(pinKey(), { salt, hash: await pinHash(saisie, salt) }); ecrireJSON(triesKey(), { n: 0, until: 0 });
      fermer(); shimToast(mode === "changer" ? "🔒 Nouveau code secret enregistré" : "🔒 Code secret activé sur ce téléphone"); window.__rerender && window.__rerender(); return;
    }
    // déverrouillage
    const t = lireJSON(triesKey()) || { n: 0, until: 0 };
    if (t.until > Date.now()) return secoue(`Trop d'essais. Patientez ${Math.ceil((t.until - Date.now()) / 1000)} s.`);
    const p = lireJSON(pinKey());
    if (p && (await pinHash(saisie, p.salt)) === p.hash) { ecrireJSON(triesKey(), { n: 0, until: 0 }); fermer(); return; }
    t.n++;
    if (t.n >= 10) return effacerTelephone("10 codes faux de suite : par sécurité, ce téléphone a été déconnecté et ses données effacées. Reconnectez-vous avec votre e-mail et votre mot de passe.");
    if (t.n >= 5) t.until = Date.now() + 30000 * Math.pow(2, t.n - 5);
    ecrireJSON(triesKey(), t);
    secoue(t.n >= 5 ? `Code faux. Attendez ${Math.round((t.until - Date.now()) / 1000)} s (${10 - t.n} essai(s) avant effacement).` : "Code faux.");
  }
  el.addEventListener("click", (e) => {
    const k = e.target.closest("[data-k]")?.dataset.k; if (!k) return;
    if (k === "oubli") { if (e.target.dataset.sure) effacerTelephone("Reconnectez-vous avec votre e-mail et votre mot de passe, puis créez un nouveau code."); else { e.target.dataset.sure = "1"; e.target.textContent = "Confirmer : se déconnecter de ce téléphone ?"; } return; }
    if (k === "x") { if (mode === "changer") fermer(); return; }
    if (k === "del") { saisie = saisie.slice(0, -1); return maj(); }
    if (saisie.length < 4) { saisie += k; maj(); if (saisie.length === 4) setTimeout(valider, 120); }
  });
  maj();
}
window.__whLock = () => { if (aUnCode()) ouvrirVerrou("ouvrir"); else ouvrirVerrou("creer"); };
function demarrerVerrou() {
  if (!pinDispo()) return;
  ouvrirVerrou(aUnCode() ? "ouvrir" : "creer");
  document.addEventListener("visibilitychange", () => {
    if (!currentUser) return;
    if (document.visibilityState === "hidden") LOCK.hiddenAt = Date.now();
    else if (LOCK.hiddenAt && Date.now() - LOCK.hiddenAt > LOCK.apres && aUnCode()) ouvrirVerrou("ouvrir");
  });
}

/* ---------- gestion de l'équipe (onglet Carte) ---------- */
async function enregistrerEquipe(membres) {
  const p = setDoc(doc(fs, "acces", "equipe"), { membres, majAt: Date.now(), majBy: monEmail() });
  await Promise.race([p, new Promise((_, ko) => setTimeout(() => ko({ code: "unavailable", message: "délai dépassé" }), 15000))]);
}
const ROLES = { proprietaire: "Propriétaire", gestionnaire: "Gestionnaire" };
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
function equipeHTML() {
  const moi = monEmail();
  const verrou = pinDispo() ? (aUnCode() ? `<div class="wh-safe">🔒 Code secret actif · la caisse se verrouille après 2 min hors de l'application</div>` : `<div class="wh-alarm">Pas encore de code secret sur ce téléphone.</div>`) : "";
  const tel = `<h2 class="sec">Sécurité de ce téléphone</h2><div class="list wh-sec">${verrou}
    ${pinDispo() ? (aUnCode() ? `<div style="display:flex;gap:8px;margin-top:10px"><button class="btn ghost small" style="flex:1;margin:0" data-wh="lock-now">🔒 Verrouiller</button><button class="btn ghost small" style="flex:1;margin:0" data-wh="pin-change">Changer le code</button></div>` : `<button class="btn primary small" style="width:100%;margin-top:10px" data-wh="lock-now">🔒 Créer mon code secret</button>`) : ""}</div>`;
  if (!ACCES.pret) return tel + `<h2 class="sec">Équipe et accès</h2><div class="list wh-sec"><div style="color:var(--muted)">Vérification des accès…</div></div>`;
  if (!ACCES.protege) {
    const autres = [...new Set((diagList || []).map(d => String(d.email || "").toLowerCase()).filter(e => e && e !== moi && emailOk(e)))];
    return tel + `<h2 class="sec">Équipe et accès</h2><div class="list wh-sec">
      <div class="wh-alarm"><b>⚠ Caisse pas encore protégée.</b> Aujourd'hui, n'importe quel compte créé sur votre projet Firebase pourrait entrer.</div>
      <p style="font-size:14px;margin:10px 0 4px">En protégeant la caisse, seuls les e-mails inscrits ici pourront l'ouvrir. Vous (<b>${esc2(moi)}</b>) devenez <b>propriétaire</b>.</p>
      ${autres.length ? `<p style="font-size:13.5px;color:var(--muted);margin:6px 0">Ces téléphones déjà reliés gardent leur accès comme gestionnaires :<br>${autres.map(esc2).join("<br>")}</p>` : ""}
      <button class="btn primary" style="width:100%;margin-top:10px" data-wh="proteger" data-autres="${esc2(autres.join(","))}">🔒 Protéger la caisse</button></div>`;
  }
  const chef = ACCES.role === "proprietaire";
  const liste = Object.entries(ACCES.membres).sort((a, b) => (a[1] === "proprietaire" ? 0 : 1) - (b[1] === "proprietaire" ? 0 : 1) || a[0].localeCompare(b[0]));
  const vu = Object.fromEntries((diagList || []).map(d => [String(d.email || "").toLowerCase(), d]));
  return tel + `<h2 class="sec">Équipe et accès <span>${liste.length} personne${liste.length > 1 ? "s" : ""}</span></h2><div class="list wh-sec">
    <div class="wh-safe">✓ Caisse protégée · votre rôle : ${ROLES[ACCES.role] || "?"}</div>
    <div style="margin-top:8px">${liste.map(([e, r]) => `<div class="wh-mem"><span class="e">${esc2(e)}${e === moi ? " (vous)" : ""}<small>${vu[e] ? esc2((vu[e].name ? vu[e].name + " · " : "") + "vu " + ago(vu[e].lastSeen)) : "pas encore connecté"}</small></span>
      ${chef && e !== moi ? `<button class="wh-role ${r === "proprietaire" ? "p" : ""}" data-wh="role" data-e="${esc2(e)}" aria-label="Changer le rôle de ${esc2(e)}">${ROLES[r] || r} ⇄</button><button class="wh-x" data-wh="retirer" data-e="${esc2(e)}" aria-label="Retirer ${esc2(e)}">✕</button>` : `<span class="wh-role ${r === "proprietaire" ? "p" : ""}">${ROLES[r] || r}</span>`}</div>`).join("")}</div>
    ${chef ? `<div class="wh-add"><input id="wh-new" type="email" inputmode="email" autocapitalize="off" placeholder="E-mail de la personne" aria-label="E-mail à ajouter"><select id="wh-newr" aria-label="Rôle"><option value="gestionnaire">Gestionnaire</option><option value="proprietaire">Propriétaire</option></select><button class="btn primary small" style="margin:0" data-wh="ajouter">Ajouter</button></div>
    <p style="font-size:12.5px;color:var(--muted);margin:8px 0 0">Créez d'abord son compte dans Firebase → Authentication → Users, puis ajoutez son e-mail ici. Retirer quelqu'un coupe son accès tout de suite et efface la caisse de son téléphone.</p>`
    : `<p style="font-size:12.5px;color:var(--muted);margin:8px 0 0">Seul le propriétaire peut modifier l'équipe.</p>`}
  </div>`;
}
async function actionEquipe(b) {
  const a = b.dataset.wh, moi = monEmail();
  try {
    if (a === "lock-now") { window.__whLock(); return; }
    if (a === "pin-change") { ouvrirVerrou("changer"); return; }
    if (a === "proteger") {
      if (!moi) { shimToast("Ce compte n'a pas d'e-mail."); return; }
      const membres = { [moi]: "proprietaire" };
      (b.dataset.autres || "").split(",").filter(emailOk).forEach(e => { membres[e] = "gestionnaire"; });
      b.disabled = true; b.textContent = "Protection en cours…";
      await enregistrerEquipe(membres); shimToast("🔒 Caisse protégée : seuls les e-mails de l'équipe peuvent entrer"); return;
    }
    if (ACCES.role !== "proprietaire") return;
    const m = { ...ACCES.membres };
    if (a === "ajouter") {
      const e = (document.getElementById("wh-new")?.value || "").trim().toLowerCase();
      if (!emailOk(e)) { shimToast("E-mail pas valide (ex. nom@gmail.com)."); return; }
      if (m[e]) { shimToast("Cette personne est déjà dans l'équipe."); return; }
      m[e] = document.getElementById("wh-newr")?.value === "proprietaire" ? "proprietaire" : "gestionnaire";
      await enregistrerEquipe(m); shimToast("✓ " + e + " ajouté(e) à l'équipe");
    } else if (a === "role") {
      const e = b.dataset.e; if (!m[e] || e === moi) return;
      m[e] = m[e] === "proprietaire" ? "gestionnaire" : "proprietaire";
      await enregistrerEquipe(m); shimToast(e + " : " + ROLES[m[e]]);
    } else if (a === "retirer") {
      const e = b.dataset.e; if (!m[e] || e === moi) return;
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Sûr ?"; b.style.width = "auto"; b.style.padding = "0 8px"; return; }
      delete m[e]; await enregistrerEquipe(m); shimToast(e + " n'a plus accès à la caisse");
    }
  } catch (ex) {
    shimToast(isOffline(ex) ? "Pas de connexion : la modification de l'équipe demande internet." : "Refusé : " + explain(ex));
    window.__rerender && window.__rerender();
  }
}

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
      watchStatus(); watchAcces();
      const go = () => demarrerVerrou();
      document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : go();
    } else {
      const show = () => showLogin();
      document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", show) : show();
    }
  });
  const table = { db: dbApi, assets: assetsApi, user: userApi, downloads: downloadsApi };
  window.claude = { use: async (name) => { await ready; return table[name] || null; } };
}
