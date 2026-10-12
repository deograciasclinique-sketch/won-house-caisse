// WON HOUSE — page CLIENT : voir le menu et commander (aucun compte, aucun accès à la caisse).
// Lit uniquement le document public « public/menu » et crée des commandes dans « commandes ».
// Le client suit sa commande grâce à son numéro secret (gardé sur son téléphone).
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, collection, onSnapshot, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";

const cfg = window.FIREBASE_CONFIG;
const app = initializeApp(cfg);
const fs = getFirestore(app);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const F = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR").replace(/[  ]/g, " ") + " F";
const params = new URLSearchParams(location.search);
const TABLE_URL = (params.get("table") || "").slice(0, 10);

function ico(n) {
  n = (n || "").toLowerCase();
  const m = [["hach", "🍖"], ["viande", "🥩"], ["saucis", "🌭"], ["riz", "🍚"], ["spag", "🍝"], ["panini", "🥪"], ["chawarma", "🌯"], ["frite", "🍟"], ["glace", "🍦"], ["bissap", "🍹"], ["jus", "🧃"], ["poisson", "🐟"], ["poulet", "🍗"], ["salade", "🥗"], ["burger", "🍔"], ["pizza", "🍕"], ["café", "☕"], ["thé", "🍵"], ["eau", "💧"], ["soda", "🥤"], ["coca", "🥤"], ["gâteau", "🍰"], ["omelette", "🍳"], ["oeuf", "🍳"], ["œuf", "🍳"]];
  for (const [k, e] of m) if (n.includes(k)) return e;
  return "🍽️";
}

const MODES = [["sur place", "🪑 Sur place"], ["à emporter", "🛍️ À emporter"], ["livraison", "🛵 Livraison"]];
const ETAPES = [
  ["nouvelle", "Envoyée", "Le restaurant a reçu votre commande."],
  ["acceptee", "Acceptée", "Votre commande est en préparation."],
  ["prete", "Prête", "Votre commande est prête !"],
  ["servie", "Servie", "Bon appétit ! Merci d'avoir choisi WON HOUSE."],
];

const ST = { menu: null, panier: {}, vue: "menu", commandes: lireCommandes(), suivi: null, suiviId: null, envoi: false, err: "", geo: "", payErr: "", payEnvoi: false };
const form = { mode: TABLE_URL ? "sur place" : "", table: TABLE_URL, adresse: "", nom: lire("whc-nom"), tel: lire("whc-tel"), note: "", pos: null, paie: "", op: "", payNum: lire("whc-tel"), payRef: "" };

/* ---------------- livraison : distance et frais ---------------- */
// Distance à vol d'oiseau (km) entre deux points GPS.
function distanceKm(a, b) {
  const R = 6371, rad = (x) => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const resto = () => { const l = ST.menu?.livraison; return l && typeof l.lat === "number" && typeof l.lng === "number" ? l : null; };
const prixKm = () => Number(ST.menu?.livraison?.prixKm) || 500;
// Frais = prix par km × nombre de km commencés (au moins 1 km).
function livraison() {
  if (form.mode !== "livraison" || !form.pos || !resto()) return { km: 0, frais: 0, connu: false };
  const d = distanceKm(resto(), form.pos);
  const km = Math.max(1, Math.ceil(d));
  return { km, d, frais: km * prixKm(), connu: true };
}
const frais = () => livraison().frais;

/* ---------------- Mobile Money ---------------- */
const OPS = [["orange", "Orange Money", "*144#"], ["moov", "Moov Money", "*555#"]];
function operateurs() {
  const p = ST.menu?.paiement || {};
  return OPS.filter(([k]) => (p[k] || "").trim()).map(([k, nom, ussd]) => ({ k, nom, numero: p[k].trim(), ussd: (p["ussd_" + k] || ussd).trim() }));
}
const telUssd = (code) => "tel:" + code.replace(/#/g, "%23");

function lire(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
function ecrire(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lireCommandes() { try { return JSON.parse(localStorage.getItem("whc-commandes") || "[]"); } catch (e) { return []; } }
function garderCommande(c) { ST.commandes = [c, ...ST.commandes.filter(x => x.id !== c.id)].slice(0, 10); ecrire("whc-commandes", JSON.stringify(ST.commandes)); }

const produits = () => (ST.menu?.produits || []).filter(p => p && p.nom);
const dispo = (p) => !(ST.menu?.indispo || []).includes(p.nom);
const lignes = () => produits().filter(p => ST.panier[p.nom] > 0 && dispo(p)).map(p => ({ produit: p.nom, prix: Number(p.prix) || 0, qte: ST.panier[p.nom] }));
const total = () => lignes().reduce((t, l) => t + l.prix * l.qte, 0);
const nbArticles = () => lignes().reduce((t, l) => t + l.qte, 0);

/* ---------------- rendu ---------------- */
function render() {
  const v = $("#vue");
  if (!ST.menu) { v.innerHTML = `<div class="vide">${ST.err ? esc(ST.err) : "Chargement du menu…"}</div>`; barre(); return; }
  if (ST.vue === "menu") v.innerHTML = vueMenu();
  if (ST.vue === "panier") v.innerHTML = vuePanier();
  if (ST.vue === "suivi") v.innerHTML = vueSuivi();
  if (ST.vue === "mes") v.innerHTML = vueMes();
  barre();
}

function vueMenu() {
  const ferme = !ST.menu.ouvert;
  const ps = produits();
  return `
  ${ferme ? `<div class="alerte">Les commandes sont fermées pour le moment. Vous pouvez consulter le menu.</div>` : ""}
  ${TABLE_URL ? `<div class="info">🪑 Vous êtes à la <b>table ${esc(TABLE_URL)}</b></div>` : ""}
  <h2>Notre menu</h2>
  <div class="carte">
  ${ps.length ? ps.map(p => {
    const q = ST.panier[p.nom] || 0, ok = dispo(p);
    return `<div class="plat ${ok ? "" : "off"} ${q ? "pris" : ""}">
      <div class="emo">${ico(p.nom)}</div>
      <div class="nom"><b>${esc(p.nom)}</b><span>${ok ? F(p.prix) : "Épuisé aujourd'hui"}</span></div>
      ${ok && !ferme ? (q
        ? `<div class="qte"><button data-moins="${esc(p.nom)}" aria-label="Retirer un ${esc(p.nom)}">−</button><b>${q}</b><button data-plus="${esc(p.nom)}" aria-label="Ajouter un ${esc(p.nom)}">+</button></div>`
        : `<button class="ajout" data-plus="${esc(p.nom)}">Ajouter</button>`) : ""}
    </div>`;
  }).join("") : `<div class="vide">Le menu n'est pas encore publié.</div>`}
  </div>
  ${ST.commandes.length ? `<button class="lien" data-vue="mes">🧾 Mes commandes (${ST.commandes.length})</button>` : ""}
  ${ST.menu.tel ? `<a class="lien" href="tel:${esc(ST.menu.tel)}">📞 Appeler le restaurant · ${esc(ST.menu.tel)}</a>` : ""}`;
}

function vuePanier() {
  const ls = lignes();
  if (!ls.length) { ST.vue = "menu"; return vueMenu(); }
  const m = form.mode;
  return `
  <button class="retour" data-vue="menu">‹ Retour au menu</button>
  <h2>Ma commande</h2>
  <div class="recap">
    ${ls.map(l => `<div class="ligne"><span>${l.qte} × ${esc(l.produit)}</span><b>${F(l.qte * l.prix)}</b></div>`).join("")}
    <div class="ligne tot"><span>Total</span><b>${F(total())}</b></div>
  </div>
  <label class="lab">Comment voulez-vous être servi ?</label>
  <div class="modes">${MODES.map(([k, l]) => `<button class="${m === k ? "on" : ""}" data-mode="${k}">${l}</button>`).join("")}</div>
  ${m === "sur place" ? `<label class="lab" for="f-table">Numéro de table</label><input id="f-table" inputmode="numeric" maxlength="10" value="${esc(form.table)}" placeholder="ex. 4">` : ""}
  ${m === "livraison" ? `<label class="lab" for="f-adr">Adresse ou repère</label><input id="f-adr" maxlength="200" value="${esc(form.adresse)}" placeholder="Quartier, rue, couleur du portail…">` : ""}
  ${m === "livraison" ? blocLivraison() : ""}
  ${blocPaiement()}
  <label class="lab" for="f-nom">Votre nom</label><input id="f-nom" maxlength="60" autocomplete="name" value="${esc(form.nom)}" placeholder="ex. Awa">
  <label class="lab" for="f-tel">Téléphone ${m === "livraison" ? "" : "(facultatif)"}</label><input id="f-tel" type="tel" maxlength="30" autocomplete="tel" value="${esc(form.tel)}" placeholder="ex. 70 00 00 00">
  <label class="lab" for="f-note">Précision (facultatif)</label><input id="f-note" maxlength="300" value="${esc(form.note)}" placeholder="ex. sans piment, bien cuit…">
  ${ST.err ? `<div class="alerte">${esc(ST.err)}</div>` : ""}
  <div class="recap" style="margin-top:16px">
    <div class="ligne"><span>Plats</span><b>${F(total())}</b></div>
    ${m === "livraison" ? `<div class="ligne"><span>Livraison${livraison().connu ? ` (${livraison().km} km × ${F(prixKm())})` : ""}</span><b>${livraison().connu ? F(frais()) : "à confirmer"}</b></div>` : ""}
    <div class="ligne tot"><span>À payer</span><b>${F(total() + frais())}</b></div>
  </div>
  <button class="envoyer" data-envoyer ${ST.envoi ? "disabled" : ""}>${ST.envoi ? "Envoi…" : (form.paie === "mobile" ? "Commander puis payer · " : "Envoyer la commande · ") + F(total() + frais())}</button>
  <p class="petit">${form.paie === "mobile" ? "Après l'envoi, l'application vous guide pour payer par Mobile Money." : "Vous payez en espèces au restaurant, au retrait ou à la livraison."}</p>`;
}

function blocLivraison() {
  const L = livraison();
  let etat;
  if (ST.geo === "attente") etat = `<div class="info">📡 Recherche de votre position…</div>`;
  else if (form.pos) etat = `<div class="info ok">📍 Position enregistrée${form.pos.precision ? ` (précision ± ${Math.round(form.pos.precision)} m)` : ""}${L.connu ? ` · <b>${L.d < 1 ? "moins d'1" : L.d.toFixed(1).replace(".", ",")} km</b> du restaurant` : ""}</div>`;
  else if (ST.geo) etat = `<div class="alerte">${esc(ST.geo)}</div>`;
  else etat = "";
  return `<label class="lab">Votre position pour la livraison</label>
  <button class="geo" data-geo>${form.pos ? "📍 Mettre à jour ma position" : "📍 Partager ma position"}</button>
  ${etat}
  ${!resto() ? `<p class="petit">Les frais de livraison (${F(prixKm())} par km) seront confirmés par le restaurant.</p>` : `<p class="petit">Frais de livraison : ${F(prixKm())} par km, calculés depuis le restaurant.</p>`}`;
}

function blocPaiement() {
  const ops = operateurs();
  if (!ops.length) { form.paie = "especes"; return ""; }
  return `<label class="lab">Paiement</label>
  <div class="modes deux">
    <button class="${form.paie === "mobile" ? "on" : ""}" data-paie="mobile">📱 Mobile Money<small>${ops.map(o => o.nom.replace(" Money", "")).join(" · ")}</small></button>
    <button class="${form.paie === "especes" ? "on" : ""}" data-paie="especes">💵 Espèces<small>au restaurant ou à la livraison</small></button>
  </div>`;
}

function vueSuivi() {
  const c = ST.suivi;
  if (!c) return `<div class="vide">Chargement de la commande…</div>`;
  const refusee = c.statut === "refusee";
  const idx = ETAPES.findIndex(e => e[0] === c.statut);
  return `
  <button class="retour" data-vue="menu">‹ Retour au menu</button>
  <div class="ticket">
    <small>Commande n°</small><div class="code">${esc(c.code || "")}</div>
    <div class="etat ${refusee ? "ko" : ""}">${refusee ? "Commande refusée" : esc(ETAPES[Math.max(0, idx)][2])}</div>
    ${refusee && c.motif ? `<div class="petit">${esc(c.motif)}</div>` : ""}
  </div>
  ${refusee ? "" : `<div class="etapes">${ETAPES.map((e, i) => `<div class="etape ${i <= idx ? "fait" : ""} ${i === idx ? "now" : ""}"><span class="pt">${i < idx || c.statut === "servie" ? "✓" : i + 1}</span>${e[1]}</div>`).join("")}</div>`}
  <div class="recap">
    ${(c.items || []).map(l => `<div class="ligne"><span>${l.qte} × ${esc(l.produit)}</span><b>${F(l.qte * l.prix)}</b></div>`).join("")}
    ${c.mode === "livraison" ? `<div class="ligne"><span>Livraison${c.distanceKm ? ` (${c.distanceKm} km)` : ""}</span><b>${c.frais ? F(c.frais) : "à confirmer"}</b></div>` : ""}
    <div class="ligne tot"><span>À payer</span><b>${F(c.aPayer ?? c.total)}</b></div>
  </div>
  ${refusee ? "" : blocPayer(c)}
  <p class="petit">${esc(c.mode || "")}${c.table ? " · table " + esc(c.table) : ""}${c.adresse ? " · " + esc(c.adresse) : ""} — cette page se met à jour toute seule.</p>
  <button class="lien" data-vue="menu">➕ Commander autre chose</button>`;
}

function blocPayer(c) {
  const p = c.paiement;
  if (!p || p.mode !== "mobile") return "";
  const montant = F(c.aPayer ?? c.total);
  if (p.etat === "confirme") return `<div class="paye ok">✓ Paiement Mobile Money reçu par le restaurant. Merci !</div>`;
  if (p.etat === "declare") return `<div class="paye">⏳ Paiement déclaré (${esc(p.operateur === "moov" ? "Moov Money" : "Orange Money")}, réf. ${esc(p.ref)}). Le restaurant vérifie la réception.</div>`;
  const ops = operateurs();
  const op = ops.find(o => o.k === form.op) || ops[0];
  if (!op) return `<div class="paye">Paiement Mobile Money : le restaurant vous contactera.</div>`;
  return `<div class="payer">
    ${p.etat === "refuse" ? `<div class="alerte">Le restaurant n'a pas trouvé votre paiement. Vérifiez la référence ou appelez le restaurant.</div>` : ""}
    <h3>Payer ${montant} par Mobile Money</h3>
    ${ops.length > 1 ? `<div class="modes deux">${ops.map(o => `<button class="${o.k === op.k ? "on" : ""}" data-op="${o.k}">${esc(o.nom)}</button>`).join("")}</div>` : ""}
    <ol>
      <li>Touchez le bouton ci-dessous : votre téléphone compose <b>${esc(op.ussd)}</b>. Appuyez sur Appeler.</li>
      <li>Choisissez <b>Transfert d'argent</b>, puis envoyez <b>${montant}</b> au <b>${esc(op.numero)}</b>${ST.menu?.paiement?.nom ? ` (${esc(ST.menu.paiement.nom)})` : ""}.</li>
      <li>Vous recevez un SMS de confirmation : recopiez sa <b>référence</b> ci-dessous.</li>
    </ol>
    <a class="envoyer ussd" href="${telUssd(op.ussd)}">📞 Ouvrir ${esc(op.nom)} (${esc(op.ussd)})</a>
    <button class="lien" data-copier="${esc(op.numero)}">📋 Copier le numéro ${esc(op.numero)}</button>
    <label class="lab" for="p-num">Numéro qui a payé</label><input id="p-num" type="tel" maxlength="30" value="${esc(form.payNum)}" placeholder="ex. 70 00 00 00">
    <label class="lab" for="p-ref">Référence de la transaction (SMS)</label><input id="p-ref" maxlength="40" value="${esc(form.payRef)}" placeholder="ex. CI241012.1530.A12345">
    ${ST.payErr ? `<div class="alerte">${esc(ST.payErr)}</div>` : ""}
    <button class="envoyer" data-paye ${ST.payEnvoi ? "disabled" : ""}>${ST.payEnvoi ? "Envoi…" : "✓ J'ai payé"}</button>
  </div>`;
}

function vueMes() {
  return `
  <button class="retour" data-vue="menu">‹ Retour au menu</button>
  <h2>Mes commandes</h2>
  ${ST.commandes.map(c => `<button class="mes" data-suivre="${esc(c.id)}"><b>N° ${esc(c.code)}</b><span>${new Date(c.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${F(c.total)}</span></button>`).join("")}`;
}

function barre() {
  const b = $("#barre");
  const n = nbArticles();
  if (ST.vue !== "menu" || !n || !ST.menu?.ouvert) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<button data-vue="panier"><span class="n">${n}</span> Voir ma commande <b>${F(total())}</b></button>`;
}

/* ---------------- actions ---------------- */
function lireForm() {
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
  ["table:f-table", "adresse:f-adr", "nom:f-nom", "tel:f-tel", "note:f-note", "payNum:p-num", "payRef:p-ref"].forEach(x => { const [k, id] = x.split(":"); const v = g(id); if (v !== null) form[k] = v; });
}

function demanderPosition() {
  lireForm();
  if (!navigator.geolocation) { ST.geo = "Votre téléphone ne permet pas de donner la position. Écrivez l'adresse ou un repère."; render(); return; }
  ST.geo = "attente"; render();
  navigator.geolocation.getCurrentPosition((p) => {
    form.pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy || 0) };
    ST.geo = ""; render();
  }, (e) => {
    ST.geo = e && e.code === 1
      ? "Position refusée. Autorisez la localisation pour ce site (icône 🔒 à côté de l'adresse), ou écrivez un repère."
      : "Position introuvable. Activez la localisation (GPS) du téléphone puis réessayez, ou écrivez un repère.";
    render();
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
}

async function declarerPaiement() {
  lireForm();
  const c = ST.suivi, op = operateurs().find(o => o.k === form.op) || operateurs()[0];
  ST.payErr = "";
  if (!form.payRef.trim()) { ST.payErr = "Recopiez la référence du SMS de confirmation."; render(); return; }
  if (!form.payNum.trim()) { ST.payErr = "Indiquez le numéro qui a payé."; render(); return; }
  ST.payEnvoi = true; render();
  try {
    await Promise.race([updateDoc(doc(fs, "commandes", ST.suiviId), {
      paiement: { mode: "mobile", operateur: op ? op.k : "orange", numero: form.payNum.trim().slice(0, 30), ref: form.payRef.trim().slice(0, 40), etat: "declare" },
    }), new Promise((_, ko) => setTimeout(() => ko(new Error("délai")), 20000))]);
    ST.payEnvoi = false; form.payRef = ""; render();
  } catch (e) {
    ST.payEnvoi = false; ST.payErr = "Envoi impossible. Vérifiez votre connexion puis réessayez."; render();
  }
}

let stopSuivi = null;
function suivre(id) {
  stopSuivi && stopSuivi();
  ST.suivi = null; ST.suiviId = id; ST.payErr = ""; ST.vue = "suivi"; render(); scrollTo(0, 0);
  stopSuivi = onSnapshot(doc(fs, "commandes", id), (s) => {
    if (!s.exists()) { ST.suivi = { code: "?", statut: "refusee", motif: "Commande introuvable.", items: [], total: 0 }; }
    else ST.suivi = s.data({ serverTimestamps: "estimate" });
    if (ST.vue === "suivi") render();
  }, () => { if (ST.vue === "suivi") { ST.suivi = ST.suivi || { code: "?", statut: "nouvelle", items: [], total: 0 }; render(); } });
}

async function envoyer() {
  lireForm();
  ST.err = "";
  const items = lignes();
  if (!items.length) return;
  if (!form.mode) { ST.err = "Choisissez : sur place, à emporter ou livraison."; render(); return; }
  if (!form.nom.trim()) { ST.err = "Indiquez votre nom pour qu'on vous appelle quand c'est prêt."; render(); return; }
  if (form.mode === "sur place" && !form.table.trim()) { ST.err = "Indiquez votre numéro de table."; render(); return; }
  if (form.mode === "livraison" && !form.tel.trim()) { ST.err = "Pour la livraison, indiquez votre téléphone."; render(); return; }
  if (form.mode === "livraison" && !form.pos && !form.adresse.trim()) { ST.err = "Pour la livraison, partagez votre position ou écrivez un repère."; render(); return; }
  if (operateurs().length && !form.paie) { ST.err = "Choisissez le paiement : Mobile Money ou espèces."; render(); return; }
  ecrire("whc-nom", form.nom.trim()); ecrire("whc-tel", form.tel.trim());
  if (!form.payNum.trim()) form.payNum = form.tel.trim();
  const ref = doc(collection(fs, "commandes"));
  const code = ref.id.slice(-4).toUpperCase();
  const L = livraison();
  const totalPlats = items.reduce((t, l) => t + l.prix * l.qte, 0);
  const mobile = form.paie === "mobile" && operateurs().length > 0;
  const data = {
    items, total: totalPlats, frais: L.frais, distanceKm: L.km, aPayer: totalPlats + L.frais,
    position: form.mode === "livraison" && form.pos ? form.pos : null,
    paiement: { mode: mobile ? "mobile" : "especes", operateur: "", numero: "", ref: "", etat: "attente" },
    nom: form.nom.trim().slice(0, 60), tel: form.tel.trim().slice(0, 30),
    mode: form.mode, table: form.mode === "sur place" ? form.table.trim().slice(0, 10) : "",
    adresse: form.mode === "livraison" ? form.adresse.trim().slice(0, 200) : "",
    note: form.note.trim().slice(0, 300), code, statut: "nouvelle", at: serverTimestamp(),
  };
  ST.envoi = true; render();
  try {
    await Promise.race([setDoc(ref, data), new Promise((_, ko) => setTimeout(() => ko(new Error("délai")), 20000))]);
    garderCommande({ id: ref.id, code, total: data.aPayer, at: Date.now() });
    ST.panier = {}; form.note = ""; ST.envoi = false;
    if (navigator.vibrate) navigator.vibrate(80);
    suivre(ref.id);
  } catch (e) {
    ST.envoi = false;
    const c = (e && e.code) || "";
    ST.err = c === "permission-denied"
      ? "Commande refusée : les commandes sont peut-être fermées, ou un plat n'est plus disponible. Réessayez dans un instant."
      : "Envoi impossible. Vérifiez votre connexion internet puis réessayez.";
    render();
  }
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-plus],[data-moins],[data-vue],[data-mode],[data-envoyer],[data-suivre],[data-geo],[data-paie],[data-op],[data-copier],[data-paye]");
  if (!t) return;
  if (t.dataset.geo !== undefined) { demanderPosition(); return; }
  if (t.dataset.paie) { lireForm(); form.paie = t.dataset.paie; ST.err = ""; render(); return; }
  if (t.dataset.op) { lireForm(); form.op = t.dataset.op; render(); return; }
  if (t.dataset.copier) { const n = t.dataset.copier; (navigator.clipboard ? navigator.clipboard.writeText(n) : Promise.reject()).then(() => { t.textContent = "✓ Numéro copié"; }, () => { t.textContent = n; }); return; }
  if (t.dataset.paye !== undefined) { declarerPaiement(); return; }
  if (t.dataset.plus) { const k = t.dataset.plus; ST.panier[k] = Math.min(50, (ST.panier[k] || 0) + 1); render(); }
  else if (t.dataset.moins) { const k = t.dataset.moins; ST.panier[k] = Math.max(0, (ST.panier[k] || 0) - 1); render(); }
  else if (t.dataset.mode) { lireForm(); form.mode = t.dataset.mode; ST.err = ""; render(); }
  else if (t.dataset.envoyer !== undefined) envoyer();
  else if (t.dataset.suivre) suivre(t.dataset.suivre);
  else if (t.dataset.vue) {
    if (ST.vue === "panier") lireForm();
    if (t.dataset.vue !== "suivi") { stopSuivi && stopSuivi(); stopSuivi = null; }
    ST.err = ""; ST.vue = t.dataset.vue; render(); scrollTo(0, 0);
  }
});

/* ---------------- démarrage ---------------- */
onSnapshot(doc(fs, "public", "menu"), (s) => {
  ST.menu = s.exists() ? s.data() : { produits: [], ouvert: false };
  ST.err = "";
  render();
}, () => { ST.err = "Menu indisponible. Vérifiez votre connexion internet."; render(); });
render();
