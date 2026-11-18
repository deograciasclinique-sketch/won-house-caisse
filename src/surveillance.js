// WON HOUSE — Surveillance : le téléphone du service devient une caméra.
//
//  • Sur le téléphone du service (« mode caméra ») : la caméra reste allumée, détecte les
//    mouvements et envoie une photo datée à chaque mouvement ; elle envoie aussi la vidéo
//    en direct (environ 1 image par seconde) quand le propriétaire la regarde.
//  • Chez le propriétaire SEULEMENT : liste des caméras, photos des mouvements, direct.
//    Le gestionnaire peut mettre un téléphone en mode caméra, mais ne peut pas voir les images
//    (règles Firestore : surv_alertes et surv_direct sont lisibles par le propriétaire seul).
//
// Firestore :
//   surv_cameras/{camId} : { nom, actif, vu, sensibilite, pause, directJusqua, majPar }
//   surv_alertes/{id}    : { cam, nom, at, data (photo JPEG en base64), score }
//   surv_direct/{camId}  : { data, at }
import { doc, collection, setDoc, deleteDoc, onSnapshot, query, orderBy, limit, getDocs, where } from "firebase/firestore";

const CSS = `
.sv{position:fixed;inset:0;z-index:180;background:#0E0809;color:#FBF4EE;display:flex;flex-direction:column;font-family:"Nunito Sans",system-ui,sans-serif}
.sv-top{display:flex;align-items:center;gap:10px;padding:calc(12px + env(safe-area-inset-top,0px)) 14px 12px;background:#1A0F11;border-bottom:1px solid rgba(255,255,255,.08)}
.sv-top h2{flex:1;margin:0;font:800 18px "Sora",system-ui,sans-serif}
.sv-x{width:40px;height:40px;border-radius:12px;border:0;background:rgba(255,255,255,.1);color:#fff;font-size:18px}
.sv-body{flex:1;overflow:auto;padding:14px 14px calc(20px + env(safe-area-inset-bottom,0px))}
.sv-card{background:#1E1214;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:14px;margin-bottom:12px}
.sv-card h3{margin:0 0 6px;font:800 15px "Sora",system-ui,sans-serif}
.sv-card p{margin:4px 0;color:#D9C9C2;font-size:13.5px;line-height:1.45}
.sv-btn{display:block;width:100%;border:0;border-radius:14px;padding:14px;font-size:15px;font-weight:800;color:#fff;background:linear-gradient(135deg,#7A1726,#B8352A 55%,#E39A1E);margin-top:10px}
.sv-btn.g{background:rgba(255,255,255,.1)}
.sv-btn.r{background:#B42318}
.sv-btn:disabled{opacity:.5}
.sv-in{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.18);background:#120A0B;color:#fff;border-radius:12px;padding:12px;font-size:15px;margin-top:6px}
.sv-lbl{display:block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#B9A49C;margin-top:12px}
.sv-seg{display:flex;gap:6px;margin-top:6px}.sv-seg button{flex:1;border:1px solid rgba(255,255,255,.18);background:transparent;color:#fff;border-radius:12px;padding:10px 4px;font-weight:700;font-size:13px}
.sv-seg button.on{background:#E39A1E;border-color:#E39A1E;color:#1B0F0A}
.sv-cam{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08)}
.sv-cam:first-of-type{border-top:0}
.sv-cam .n{flex:1;min-width:0}.sv-cam .n b{display:block;font-size:15px}.sv-cam .n small{color:#B9A49C;font-size:12.5px}
.sv-dot{width:10px;height:10px;border-radius:50%;background:#6B6B6B;flex:none}.sv-dot.on{background:#3DDC84;box-shadow:0 0 0 4px rgba(61,220,132,.2)}.sv-dot.pause{background:#E39A1E}
.sv-sm{border:0;border-radius:10px;padding:9px 12px;font-weight:800;font-size:13px;background:#E39A1E;color:#1B0F0A}
.sv-sm.g{background:rgba(255,255,255,.12);color:#fff}
.sv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-top:8px}
.sv-ph{position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:4/3;border:0;padding:0}
.sv-ph img{width:100%;height:100%;object-fit:cover;display:block}
.sv-ph span{position:absolute;left:0;right:0;bottom:0;padding:4px 6px;font-size:11px;font-weight:700;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.8));text-align:left}
.sv-live{position:relative;flex:1;display:flex;align-items:center;justify-content:center;background:#000;min-height:0}
.sv-live img,.sv-live video{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}
.sv-badge{position:absolute;top:12px;left:12px;background:#B42318;color:#fff;font-weight:800;font-size:12px;padding:5px 10px;border-radius:99px}
.sv-info{position:absolute;bottom:12px;left:12px;right:12px;text-align:center;font-size:13px;font-weight:700;color:#fff;text-shadow:0 1px 3px #000}
.sv-noir{position:fixed;inset:0;z-index:190;background:#000;color:#555;display:flex;align-items:flex-end;justify-content:center;padding-bottom:40px;font-size:12px}
.sv-big{position:fixed;inset:0;z-index:195;background:rgba(0,0,0,.95);display:flex;flex-direction:column}
.sv-big img{flex:1;min-height:0;object-fit:contain;width:100%}
.sv-big .bar{display:flex;gap:8px;padding:12px 14px calc(16px + env(safe-area-inset-bottom,0px));color:#fff;align-items:center}
.sv-big .bar span{flex:1;font-size:13px;font-weight:700}
`;

const SENSIBILITES = { faible: 0.06, moyenne: 0.025, forte: 0.01 };
const PAUSE_ALERTE = { faible: 60000, moyenne: 30000, forte: 15000 };
const EN_LIGNE_MS = 3 * 60 * 1000;
const GARDE_JOURS = 7;

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const heure = (t) => { const d = new Date(t); return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " + String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0"); };
const ilYa = (t) => { if (!t) return "jamais"; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `il y a ${s} s` : s < 3600 ? `il y a ${Math.round(s / 60)} min` : s < 86400 ? `il y a ${Math.round(s / 3600)} h` : `il y a ${Math.round(s / 86400)} j`; };

function camId() {
  let id = localStorage.getItem("wh-surv-cam");
  if (!id) { id = "cam-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("wh-surv-cam", id); }
  return id;
}

function jpeg(video, largeur, qualite) {
  const w = video.videoWidth || 640, h = video.videoHeight || 480;
  const k = Math.min(1, largeur / w);
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext("2d"); g.drawImage(video, 0, 0, c.width, c.height);
  // date et heure incrustées, comme une vraie caméra de surveillance
  const fs = Math.max(12, Math.round(c.width / 40));
  g.font = `bold ${fs}px sans-serif`; g.fillStyle = "rgba(0,0,0,.55)";
  const txt = "WON HOUSE  " + heure(Date.now());
  g.fillRect(0, c.height - fs * 1.6, g.measureText(txt).width + fs, fs * 1.6);
  g.fillStyle = "#fff"; g.fillText(txt, fs / 2, c.height - fs * 0.45);
  return c.toDataURL("image/jpeg", qualite);
}

export function initSurveillance({ getFs, getUser, getAcces, write, notify, keepAwake, toast }) {
  let cssOk = false;
  const addCss = () => { if (cssOk) return; cssOk = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); };
  const chef = () => { const A = getAcces(); return !A || !A.protege || A.role === "proprietaire"; };

  /* ============ alerte chez le propriétaire (application ouverte) ============ */
  let stopVeille = null, vuDepuis = Date.now();
  function veilleProprietaire() {
    const fs = getFs();
    if (!fs || !getUser() || !chef() || stopVeille) return;
    vuDepuis = Date.now();
    stopVeille = onSnapshot(query(collection(fs, "surv_alertes"), orderBy("at", "desc"), limit(1)), (s) => {
      s.docChanges().forEach((ch) => {
        const d = ch.doc.data();
        if (ch.type === "added" && d.at > vuDepuis) {
          vuDepuis = d.at;
          notify("🚨 Mouvement détecté — " + (d.nom || "caméra"), "WON HOUSE · " + heure(d.at) + " · touchez Menu → Surveillance pour voir la photo");
        }
      });
    }, () => { stopVeille = null; });
  }

  /* ============ écran principal ============ */
  function ouvrir() {
    addCss();
    const el = document.createElement("div"); el.className = "sv";
    document.body.appendChild(el);
    let stopCams = null, stopAlertes = null, cams = {}, alertes = [];
    const fermer = () => { stopCams && stopCams(); stopAlertes && stopAlertes(); el.remove(); };
    const fs = getFs();

    function rendre() {
      const moiCam = cams[camId()];
      const liste = Object.entries(cams).sort((a, b) => (b[1].vu || 0) - (a[1].vu || 0));
      el.innerHTML = `<div class="sv-top"><h2>📹 Surveillance</h2><button class="sv-x" data-a="fermer" aria-label="Fermer">✕</button></div>
      <div class="sv-body">
        <div class="sv-card"><h3>Ce téléphone comme caméra</h3>
          <p>Posez le téléphone du service face à la salle ou à la caisse, <b>branché sur le chargeur</b>, puis démarrez. Il envoie une photo datée à chaque mouvement, et la vidéo en direct quand le propriétaire la regarde.</p>
          <button class="sv-btn" data-a="camera">${moiCam && moiCam.actif ? "▶ Reprendre le mode caméra" : "📹 Utiliser ce téléphone comme caméra"}</button>
        </div>
        ${chef() ? `
        <div class="sv-card"><h3>Caméras du restaurant</h3>
          ${liste.length ? liste.map(([id, c]) => {
            const enLigne = c.actif && c.vu && Date.now() - c.vu < EN_LIGNE_MS;
            return `<div class="sv-cam"><span class="sv-dot ${enLigne ? (c.pause ? "pause" : "on") : ""}"></span><span class="n"><b>${esc(c.nom || "Caméra")}</b><small>${enLigne ? (c.pause ? "En pause" : "En marche") + " · vu " + ilYa(c.vu) : c.actif ? "Hors ligne · vu " + ilYa(c.vu) : "Arrêtée"}</small></span>
              ${enLigne && !c.pause ? `<button class="sv-sm" data-a="direct" data-id="${esc(id)}">● Direct</button>` : ""}</div>`;
          }).join("") : `<p>Aucune caméra pour l'instant. Sur le téléphone du service : Menu → Surveillance → « Utiliser ce téléphone comme caméra ».</p>`}
        </div>
        <div class="sv-card"><h3>Mouvements détectés ${alertes.length ? `<small style="color:#B9A49C;font-weight:600">· ${alertes.length} dernière(s)</small>` : ""}</h3>
          ${alertes.length ? `<div class="sv-grid">${alertes.map((a, i) => `<button class="sv-ph" data-a="voir" data-i="${i}"><img src="${a.data}" alt="Mouvement ${esc(heure(a.at))}"><span>${esc(a.nom || "")} · ${esc(heure(a.at))}</span></button>`).join("")}</div>
            <button class="sv-btn g" data-a="toutEffacer">🗑 Effacer toutes les photos</button>` : `<p>Aucun mouvement enregistré.</p>`}
          <p style="font-size:12px;margin-top:10px">Les photos de plus de ${GARDE_JOURS} jours sont effacées automatiquement. Vous seul (propriétaire) voyez ces images.</p>
        </div>` : `<div class="sv-card"><p>🔒 Seul le propriétaire peut voir les images des caméras.</p></div>`}
      </div>`;
    }

    if (fs) {
      stopCams = onSnapshot(collection(fs, "surv_cameras"), (s) => { cams = {}; s.docs.forEach((d) => (cams[d.id] = d.data())); rendre(); }, () => rendre());
      if (chef()) {
        stopAlertes = onSnapshot(query(collection(fs, "surv_alertes"), orderBy("at", "desc"), limit(40)), (s) => {
          alertes = s.docs.map((d) => ({ id: d.id, ...d.data() })); rendre();
        }, () => rendre());
        // ménage : photos de plus de 7 jours
        getDocs(query(collection(fs, "surv_alertes"), where("at", "<", Date.now() - GARDE_JOURS * 86400000), limit(100)))
          .then((s) => s.docs.forEach((d) => write(() => deleteDoc(d.ref)))).catch(() => {});
      }
    }
    rendre();

    el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = b.dataset.a;
      if (a === "fermer") fermer();
      else if (a === "camera") { fermer(); modeCamera(); }
      else if (a === "direct") regarderDirect(b.dataset.id, cams[b.dataset.id]?.nom);
      else if (a === "voir") agrandir(alertes, +b.dataset.i);
      else if (a === "toutEffacer") {
        if (!confirm("Effacer définitivement toutes les photos de surveillance ?")) return;
        const s = await getDocs(collection(fs, "surv_alertes")).catch(() => null);
        s && s.docs.forEach((d) => write(() => deleteDoc(d.ref)));
        toast("Photos de surveillance effacées");
      }
    });
  }

  function agrandir(liste, i) {
    const a = liste[i]; if (!a) return;
    const el = document.createElement("div"); el.className = "sv-big";
    el.innerHTML = `<img src="${a.data}" alt=""><div class="bar"><span>${esc(a.nom || "")} · ${esc(heure(a.at))}</span>
      <button class="sv-sm g" data-b="prev">◀</button><button class="sv-sm g" data-b="next">▶</button><button class="sv-sm g" data-b="del">🗑</button><button class="sv-sm" data-b="x">Fermer</button></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-b]")?.dataset.b; if (!b) return;
      el.remove();
      if (b === "prev") agrandir(liste, Math.max(0, i - 1));
      else if (b === "next") agrandir(liste, Math.min(liste.length - 1, i + 1));
      else if (b === "del") write(() => deleteDoc(doc(getFs(), "surv_alertes", a.id)));
    });
  }

  /* ============ propriétaire : vidéo en direct ============ */
  function regarderDirect(id, nom) {
    const fs = getFs(); if (!fs) return;
    const el = document.createElement("div"); el.className = "sv";
    el.innerHTML = `<div class="sv-top"><h2>● ${esc(nom || "Caméra")} — direct</h2><button class="sv-x" data-a="x" aria-label="Fermer">✕</button></div>
      <div class="sv-live"><img alt="Image en direct"><span class="sv-badge">EN DIRECT</span><span class="sv-info">Connexion à la caméra…</span></div>`;
    document.body.appendChild(el);
    const img = el.querySelector("img"), info = el.querySelector(".sv-info");
    let dernier = 0;
    const demander = () => write(() => setDoc(doc(fs, "surv_cameras", id), { directJusqua: Date.now() + 45000 }, { merge: true }));
    demander();
    const t1 = setInterval(demander, 20000);
    const t2 = setInterval(() => { info.textContent = dernier ? (Date.now() - dernier > 8000 ? "⚠ Image figée — réseau lent ? dernière image " + ilYa(dernier) : "Image " + ilYa(dernier)) : "Connexion à la caméra…"; }, 1000);
    const stop = onSnapshot(doc(fs, "surv_direct", id), (s) => {
      const d = s.data(); if (!d || !d.data || d.at < Date.now() - 60000) return;
      img.src = d.data; dernier = d.at;
    }, () => { info.textContent = "Accès refusé : seul le propriétaire peut voir le direct."; });
    el.addEventListener("click", (e) => {
      if (!e.target.closest("[data-a=x]")) return;
      clearInterval(t1); clearInterval(t2); stop();
      write(() => setDoc(doc(fs, "surv_cameras", id), { directJusqua: 0 }, { merge: true }));
      el.remove();
    });
  }

  /* ============ téléphone du service : mode caméra ============ */
  function modeCamera() {
    addCss();
    const fs = getFs(), id = camId();
    const reglages = JSON.parse(localStorage.getItem("wh-surv-reglages") || "{}");
    let nom = reglages.nom || "Salle", sens = reglages.sens || "moyenne", facing = reglages.facing || "environment";
    let stream = null, actif = false, pause = false, timers = [], stopDoc = null, directJusqua = 0;
    let precedent = null, derniereAlerte = 0, demarreA = 0, nbAlertes = 0, dernierDirect = 0;

    const el = document.createElement("div"); el.className = "sv";
    document.body.appendChild(el);
    const sauver = () => localStorage.setItem("wh-surv-reglages", JSON.stringify({ nom, sens, facing }));
    const majDoc = (extra) => write(() => setDoc(doc(fs, "surv_cameras", id), { nom, sensibilite: sens, actif, pause, vu: Date.now(), majPar: getUser()?.email || "", ...(extra || {}) }, { merge: true }));

    function ecran() {
      el.innerHTML = `<div class="sv-top"><h2>📹 Mode caméra</h2><button class="sv-x" data-a="quitter" aria-label="Quitter">✕</button></div>
        <div class="sv-live"><video playsinline autoplay muted></video>${actif ? `<span class="sv-badge" style="${pause ? "background:#E39A1E;color:#1B0F0A" : ""}">${pause ? "EN PAUSE" : "● SURVEILLANCE"}</span><span class="sv-info"></span>` : ""}</div>
        <div class="sv-body" style="flex:none;max-height:48vh">
        ${actif ? `<div style="display:flex;gap:8px">
            <button class="sv-btn g" style="flex:1" data-a="pause">${pause ? "▶ Reprendre" : "⏸ Pause"}</button>
            <button class="sv-btn g" style="flex:1" data-a="noir">🌙 Écran noir</button>
          </div><button class="sv-btn r" data-a="arreter">■ Arrêter la surveillance</button>`
        : `<label class="sv-lbl" for="sv-nom">Nom de cette caméra</label><input class="sv-in" id="sv-nom" value="${esc(nom)}" maxlength="30" placeholder="Ex. Salle, Caisse, Cuisine">
          <span class="sv-lbl">Sensibilité aux mouvements</span>
          <div class="sv-seg">${["faible", "moyenne", "forte"].map((k) => `<button data-s="${k}" class="${sens === k ? "on" : ""}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>
          <span class="sv-lbl">Caméra</span>
          <div class="sv-seg"><button data-f="environment" class="${facing === "environment" ? "on" : ""}">Arrière</button><button data-f="user" class="${facing === "user" ? "on" : ""}">Avant</button></div>
          <button class="sv-btn" data-a="demarrer">▶ Démarrer la surveillance</button>
          <p style="font-size:12.5px;color:#B9A49C;margin-top:10px">Laissez l'application ouverte et le téléphone branché. L'écran reste allumé (luminosité au minimum). Informez l'équipe et les clients qu'une caméra filme (affiche à l'entrée).</p>`}
        </div>`;
      const v = el.querySelector("video");
      if (stream) { v.srcObject = stream; v.play().catch(() => {}); }
    }

    async function allumer() {
      stream && stream.getTracks().forEach((t) => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) { stream = null; toast("Caméra indisponible : autorisez la caméra pour WON HOUSE."); }
      ecran();
    }

    function analyser() {
      const v = el.querySelector("video");
      if (!actif || pause || !v || !v.videoWidth) return;
      const W = 64, H = 48;
      const c = analyser.c || (analyser.c = Object.assign(document.createElement("canvas"), { width: W, height: H }));
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(v, 0, 0, W, H);
      const px = g.getImageData(0, 0, W, H).data;
      const gris = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) gris[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
      if (precedent && Date.now() - demarreA > 4000) {
        let change = 0;
        for (let i = 0; i < gris.length; i++) if (Math.abs(gris[i] - precedent[i]) > 28) change++;
        const score = change / gris.length;
        // Un changement presque total = la lumière change (lampe, soleil) : ce n'est pas un mouvement.
        if (score > SENSIBILITES[sens] && score < 0.85 && Date.now() - derniereAlerte > PAUSE_ALERTE[sens]) {
          derniereAlerte = Date.now(); nbAlertes++;
          const data = jpeg(v, 960, 0.6);
          const aid = "a" + Date.now() + "-" + id.slice(-4);
          write(() => setDoc(doc(fs, "surv_alertes", aid), { cam: id, nom, at: Date.now(), data, score: Math.round(score * 1000) / 1000 }));
        }
      }
      precedent = gris;
      const info = el.querySelector(".sv-info");
      if (info) info.textContent = `${nbAlertes} mouvement(s) envoyé(s) · ${Date.now() < directJusqua ? "● le propriétaire regarde" : "démarré " + ilYa(demarreA)}`;
    }

    function envoyerDirect() {
      const v = el.querySelector("video");
      if (!actif || pause || !v || !v.videoWidth || Date.now() > directJusqua) return;
      if (Date.now() - dernierDirect < 900) return;
      dernierDirect = Date.now();
      const data = jpeg(v, 640, 0.5);
      // pas d'accumulation hors connexion : seule la dernière image compte
      setDoc(doc(fs, "surv_direct", id), { data, at: Date.now() }).catch(() => {});
    }

    function demarrer() {
      nom = (el.querySelector("#sv-nom")?.value || nom).trim().slice(0, 30) || "Caméra"; sauver();
      if (!stream) { toast("Caméra indisponible."); return; }
      actif = true; pause = false; demarreA = Date.now(); precedent = null;
      keepAwake(true, true);
      majDoc({ directJusqua: 0 });
      timers.push(setInterval(analyser, 500));
      timers.push(setInterval(envoyerDirect, 250));
      timers.push(setInterval(() => majDoc(), 60000));
      stopDoc = onSnapshot(doc(fs, "surv_cameras", id), (s) => { directJusqua = (s.data() || {}).directJusqua || 0; });
      ecran();
    }

    function arreter(quitter) {
      timers.forEach(clearInterval); timers = []; stopDoc && stopDoc(); stopDoc = null;
      if (actif) { actif = false; majDoc({ directJusqua: 0 }); }
      keepAwake(false, false);
      if (quitter) { stream && stream.getTracks().forEach((t) => t.stop()); stream = null; el.remove(); document.removeEventListener("visibilitychange", vis); }
      else ecran();
    }

    // Si l'application passe en arrière-plan, Android coupe la caméra : on la relance au retour.
    const vis = () => { if (document.visibilityState === "visible" && actif) allumer(); };
    document.addEventListener("visibilitychange", vis);

    el.addEventListener("click", (e) => {
      const s = e.target.closest("[data-s]"); if (s) { sens = s.dataset.s; sauver(); ecran(); return; }
      const f = e.target.closest("[data-f]"); if (f) { facing = f.dataset.f; sauver(); allumer(); return; }
      const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
      if (a === "demarrer") demarrer();
      else if (a === "pause") { pause = !pause; precedent = null; majDoc(); ecran(); }
      else if (a === "arreter") { if (confirm("Arrêter la surveillance ?")) arreter(false); }
      else if (a === "quitter") { if (!actif || confirm("Quitter le mode caméra ? La surveillance s'arrête.")) arreter(true); }
      else if (a === "noir") {
        const n = document.createElement("div"); n.className = "sv-noir"; n.textContent = "Surveillance en cours · touchez pour rallumer";
        n.onclick = () => n.remove(); document.body.appendChild(n);
      }
    });
    allumer();
  }

  return { ouvrir, veilleProprietaire };
}
