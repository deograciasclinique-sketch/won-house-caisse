// WON HOUSE — page CLIENT : voir le menu et commander (aucun compte, aucun accès à la caisse).
// Lit uniquement le document public « public/menu » (et les photos « public/photo-… »)
// et crée des commandes dans « commandes ».
// Le client suit sa commande grâce à son numéro secret (gardé sur son téléphone).
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, collection, onSnapshot, setDoc, updateDoc, getDoc, serverTimestamp,
} from "firebase/firestore";

const cfg = window.FIREBASE_CONFIG;
const app = initializeApp(cfg);
const fs = getFirestore(app);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const F = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0") + "\u00A0F";
const params = new URLSearchParams(location.search);
const TABLE_URL = (params.get("table") || "").slice(0, 10);

/* ---------------- icônes ---------------- */
const SVG = (d, w = 20) => `<svg class="ico" width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  plus: SVG('<path d="M12 5v14M5 12h14"/>'),
  moins: SVG('<path d="M5 12h14"/>'),
  retour: SVG('<path d="m15 5-7 7 7 7"/>'),
  fermer: SVG('<path d="M6 6l12 12M18 6 6 18"/>', 18),
  cherche: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 18),
  ticket: SVG('<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>'),
  sac: SVG('<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>', 22),
  table: SVG('<path d="M4 10h16M6 10v10M18 10v10M8 4h8l2 6H6z"/>'),
  emporter: SVG('<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  moto: SVG('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-2-7h-3M13 10h3l2 7M6 14l2-4h2"/>'),
  pin: SVG('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  tel: SVG('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', 18),
  horloge: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 22),
  ok: SVG('<path d="m5 12 5 5 9-10"/>', 14),
  okGros: SVG('<path d="m5 12 5 5 9-10"/>', 22),
  copier: SVG('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>', 18),
};

function ico(n) {
  n = (n || "").toLowerCase();
  const m = [["hach", "🍖"], ["viande", "🥩"], ["saucis", "🌭"], ["riz", "🍚"], ["spag", "🍝"], ["panini", "🥪"], ["chawarma", "🌯"], ["shawarma", "🌯"], ["frite", "🍟"], ["glace", "🍦"], ["bissap", "🍹"], ["jus", "🧃"], ["poisson", "🐟"], ["poulet", "🍗"], ["salade", "🥗"], ["burger", "🍔"], ["pizza", "🍕"], ["café", "☕"], ["thé", "🍵"], ["eau", "💧"], ["soda", "🥤"], ["coca", "🥤"], ["gâteau", "🍰"], ["omelette", "🍳"], ["oeuf", "🍳"], ["œuf", "🍳"]];
  for (const [k, e] of m) if (n.includes(k)) return e;
  return "🍽️";
}
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/* ---------------- rubriques ---------------- */
const RUBRIQUES = [
  ["plats", "Plats"], ["sandwichs", "Sandwichs"], ["desserts", "Glaces & desserts"], ["boissons", "Boissons"], ["autres", "Autres"],
];
const MOTS = [
  ["sandwichs", ["panini", "chawarma", "shawarma", "burger", "sandwich", "pizza", "tacos"]],
  ["desserts", ["glace", "gâteau", "gateau", "dessert", "yaourt", "crêpe", "beignet"]],
  ["boissons", ["bissap", "jus", "eau", "soda", "coca", "fanta", "sprite", "café", "thé", "gingembre", "zoom", "bière", "boisson", "lait"]],
  ["plats", ["riz", "spag", "pâte", "frite", "plat", "poulet", "poisson", "attiéké", "alloco", "tô", "viande", "omelette", "haricot", "couscous", "salade", "brochette", "soupe"]],
];
function rubrique(nom) {
  const n = (nom || "").toLowerCase();
  for (const [k, mots] of MOTS) if (mots.some(m => n.includes(m))) return k;
  return "autres";
}

const MODES = [["sur place", "Sur place", "table"], ["à emporter", "À emporter", "emporter"], ["livraison", "Livraison", "moto"]];

const ST = { menu: null, panier: {}, vue: "menu", rub: "tout", q: "", fiche: null, commandes: lireCommandes(), suivi: null, suiviId: null, envoi: false, err: "", geo: "", payErr: "", payEnvoi: false };
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

/* ---------------- produits et groupes (ex. « Panini 500 / 700 / 1000 » → un seul plat avec des tailles) ---------------- */
const produits = () => (ST.menu?.produits || []).filter(p => p && p.nom);
const dispo = (p) => !(ST.menu?.indispo || []).includes(p.nom);
const parNom = (nom) => produits().find(p => p.nom === nom);

function groupes() {
  const ps = produits();
  const out = new Map();
  ps.forEach(p => {
    const m = String(p.nom).match(/^(.*\S)\s+(\d{2,6})\s*F?$/i);
    const base = m && ps.filter(q => q.nom !== p.nom && String(q.nom).startsWith(m[1] + " ")).length ? m[1] : p.nom;
    if (!out.has(base)) out.set(base, { nom: base, variantes: [] });
    out.get(base).variantes.push({ ...p, label: base === p.nom ? p.nom : F(p.prix) });
  });
  return [...out.values()].map(g => {
    g.variantes.sort((a, b) => (Number(a.prix) || 0) - (Number(b.prix) || 0));
    const libres = g.variantes.filter(dispo);
    g.dispo = libres.length > 0;
    g.min = Math.min(...(libres.length ? libres : g.variantes).map(v => Number(v.prix) || 0));
    g.multi = g.variantes.length > 1;
    g.photo = (g.variantes.find(v => /^photo-[a-z0-9]+$/.test(v.photo || "")) || {}).photo || "";
    g.desc = String((g.variantes.find(v => v.desc && String(v.desc).trim()) || {}).desc || "").trim();
    g.qte = g.variantes.reduce((t, v) => t + (ST.panier[v.nom] || 0), 0);
    g.rub = rubrique(g.nom);
    return g;
  });
}
const groupeDe = (nom) => groupes().find(g => g.nom === nom || g.variantes.some(v => v.nom === nom));

const lignes = () => produits().filter(p => ST.panier[p.nom] > 0 && dispo(p)).map(p => ({ produit: p.nom, prix: Number(p.prix) || 0, qte: ST.panier[p.nom] }));
const total = () => lignes().reduce((t, l) => t + l.prix * l.qte, 0);
const nbArticles = () => lignes().reduce((t, l) => t + l.qte, 0);

/* ---------------- photos des plats ---------------- */
const photos = {}; const enCours = new Set();
const cleOk = (k) => /^photo-[a-z0-9]+$/.test(k || "");
function phHTML(nom, k, extra) {
  return `<span class="ph tint${1 + hash(nom) % 4}"><span class="emo" aria-hidden="true">${ico(nom)}</span>${cleOk(k) ? `<img data-ph="${esc(k)}" alt="">` : ""}${extra || ""}</span>`;
}
function montrer(k) { document.querySelectorAll(`img[data-ph="${k}"]`).forEach(img => { if (img.getAttribute("src") !== photos[k]) img.src = photos[k]; img.classList.add("ok"); img.alt = ""; }); }
async function charger(k) {
  if (photos[k]) return montrer(k);
  if (enCours.has(k)) return;
  enCours.add(k);
  const c = lire("whp-" + k);
  if (c) photos[k] = c;
  else {
    try { const s = await getDoc(doc(fs, "public", k)); if (s.exists() && typeof s.data().data === "string") { photos[k] = s.data().data; ecrire("whp-" + k, photos[k]); } } catch (e) {}
  }
  enCours.delete(k);
  if (photos[k]) montrer(k);
}
function chargerPhotos() { document.querySelectorAll("img[data-ph]").forEach(img => { const k = img.dataset.ph; if (cleOk(k)) charger(k); }); }

/* ---------------- rendu ---------------- */
function render() {
  const v = $("#vue");
  if (!ST.menu) { v.innerHTML = `<div class="vide">${ST.err ? esc(ST.err) : "Chargement du menu…"}</div>`; barre(); return; }
  if (ST.vue === "menu") v.innerHTML = vueMenu();
  if (ST.vue === "panier") v.innerHTML = vuePanier();
  if (ST.vue === "suivi") v.innerHTML = vueSuivi();
  if (ST.vue === "mes") v.innerHTML = vueMes();
  barre(); fiche(); chargerPhotos();
}

function vueMenu() {
  const ferme = !ST.menu.ouvert;
  const gs = groupes();
  const presentes = RUBRIQUES.filter(([k]) => gs.some(g => g.rub === k));
  if (ST.rub !== "tout" && !presentes.some(([k]) => k === ST.rub)) ST.rub = "tout";
  const nbCmd = ST.commandes.length;
  return `
  <header class="top">
    <div class="brand">
      <div class="mark" aria-hidden="true">WH</div>
      <div><b>WON HOUSE</b><span class="statut ${ferme ? "ferme" : ""}"><i></i>${ferme ? "Commandes fermées pour le moment" : "Ouvert · on prend vos commandes"}</span></div>
    </div>
    <button class="rond" data-vue="mes" aria-label="Mes commandes${nbCmd ? ` (${nbCmd})` : ""}" ${nbCmd ? "" : "hidden"}>${I.ticket}${nbCmd ? `<span class="pastille">${nbCmd}</span>` : ""}</button>
  </header>
  <h1 class="titre">On mange quoi<br>aujourd'hui ?</h1>
  <label class="cherche">${I.cherche}<span class="sr">Chercher</span><input id="q" type="search" value="${esc(ST.q)}" placeholder="Chercher un plat, une boisson…" autocomplete="off"></label>
  ${presentes.length > 1 ? `<div class="chips" role="tablist" aria-label="Rubriques">
    <button class="chip ${ST.rub === "tout" ? "on" : ""}" role="tab" aria-selected="${ST.rub === "tout"}" data-rub="tout">Tout</button>
    ${presentes.map(([k, l]) => `<button class="chip ${ST.rub === k ? "on" : ""}" role="tab" aria-selected="${ST.rub === k}" data-rub="${k}">${esc(l)}</button>`).join("")}
  </div>` : ""}
  ${ferme ? `<div class="bandeau ko">Les commandes sont fermées pour le moment. Vous pouvez regarder le menu.</div>` : ""}
  ${TABLE_URL ? `<div class="bandeau info">Vous êtes à la table <b>${esc(TABLE_URL)}</b></div>` : ""}
  <div id="liste">${listeHTML()}</div>
  ${ST.menu.tel ? `<div class="pad" style="margin-top:22px"><a class="lien" href="tel:${esc(ST.menu.tel)}">${I.tel} Appeler le restaurant · ${esc(ST.menu.tel)}</a></div>` : ""}`;
}

function listeHTML() {
  const gs = groupes();
  if (!gs.length) return `<div class="vide">Le menu n'est pas encore publié.</div>`;
  const q = ST.q.trim().toLowerCase();
  const ferme = !ST.menu.ouvert;
  if (q) {
    const r = gs.filter(g => g.nom.toLowerCase().includes(q));
    return r.length ? `<div class="rubrique"><h2>Résultats</h2><span>${r.length} choix</span></div><div class="grille">${r.map(carteHTML).join("")}</div>`
      : `<div class="vide">Aucun plat ne correspond à « ${esc(ST.q.trim())} ».</div>`;
  }
  let html = "";
  const vg = ST.menu.vedette ? groupeDe(ST.menu.vedette) : null;
  if (ST.rub === "tout" && vg && vg.dispo) {
    html += `<button class="vedette" data-ouvrir="${esc(vg.nom)}" aria-label="${esc(vg.nom)}, ${vg.multi ? "dès " : ""}${F(vg.min)}">
      <span class="txt"><span class="badge">Le plus commandé</span><span><span class="nom">${esc(vg.nom)}</span><br><small>${vg.multi ? "dès " : ""}${F(vg.min)}</small></span></span>
      <span class="vph">${phHTML(vg.nom, vg.photo)}${ferme ? "" : `<span class="plus" aria-hidden="true">${I.plus}</span>`}</span>
    </button>`;
  }
  RUBRIQUES.forEach(([k, l]) => {
    if (ST.rub !== "tout" && ST.rub !== k) return;
    const r = gs.filter(g => g.rub === k);
    if (!r.length) return;
    html += `<section><div class="rubrique"><h2>${esc(l)}</h2><span>${r.length} choix</span></div><div class="grille">${r.map(carteHTML).join("")}</div></section>`;
  });
  return html;
}

function carteHTML(g) {
  const ferme = !ST.menu.ouvert;
  const extra = !g.dispo ? `<span class="epuise">Épuisé aujourd'hui</span>` : g.qte ? `<span class="dans">${g.qte} dans le panier</span>` : "";
  return `<div class="carte ${g.dispo ? "" : "off"}">
    <button class="ouvrir" data-ouvrir="${esc(g.nom)}" aria-label="${esc(g.nom)}, ${g.multi ? "dès " : ""}${F(g.min)}${g.dispo ? "" : ", épuisé"}">${phHTML(g.nom, g.photo, extra)}</button>
    <div class="bas">
      <div style="min-width:0"><span class="nom">${esc(g.nom)}</span>${g.desc ? `<span class="compo-c">${esc(g.desc)}</span>` : ""}<span class="prix">${g.multi ? "<small>dès </small>" : ""}${F(g.min)}</span></div>
      ${g.dispo && !ferme ? `<button class="ajout" data-${g.multi ? "ouvrir" : "plus"}="${esc(g.multi ? g.nom : g.variantes[0].nom)}" aria-label="Ajouter ${esc(g.nom)}">${I.plus}</button>` : ""}
    </div>
  </div>`;
}

/* fiche d'un plat (feuille qui monte du bas) */
function fiche() {
  const c = $("#couche");
  const f = ST.fiche;
  const g = f && groupeDe(f.groupe);
  if (!g || ST.vue !== "menu") { if (c.innerHTML) c.innerHTML = ""; ST.fiche = null; document.body.style.overflow = ""; return; }
  const choix = g.variantes.find(v => v.nom === f.choix && dispo(v)) || g.variantes.find(dispo) || g.variantes[0];
  f.choix = choix.nom;
  const ferme = !ST.menu.ouvert, ok = dispo(choix) && !ferme;
  document.body.style.overflow = "hidden";
  c.innerHTML = `<div class="voile" data-voile>
    <div class="feuille" role="dialog" aria-modal="true" aria-label="${esc(g.nom)}">
      <div class="poignee" aria-hidden="true"></div>
      <div style="position:relative">${phHTML(g.nom, g.photo)}<button class="fermer" data-fermer aria-label="Fermer">${I.fermer}</button></div>
      <div class="fiche-tete"><h2>${esc(g.nom)}</h2><span class="prix">${F(choix.prix)}</span></div>
      ${(String(choix.desc || "").trim() || g.desc) ? `<p class="compo pad">${esc(String(choix.desc || "").trim() || g.desc)}</p>` : ""}
      ${g.multi ? `<div class="pad"><span class="lab">Choisir la taille</span><div class="tailles">${g.variantes.map(v => `<button class="taille ${v.nom === choix.nom ? "on" : ""}" data-taille="${esc(v.nom)}" aria-pressed="${v.nom === choix.nom}" ${dispo(v) ? "" : "disabled"}>${esc(v.label)}</button>`).join("")}</div></div>` : ""}
      ${!g.dispo ? `<p class="note pad">Épuisé aujourd'hui. Revenez bientôt !</p>` : ferme ? `<p class="note pad">Les commandes sont fermées pour le moment.</p>` : ""}
      ${ok ? `<div class="fiche-bas">
        <div class="stepper"><button data-fq="-1" aria-label="Un de moins">${I.moins}</button><b aria-live="polite">${f.qte}</b><button data-fq="1" aria-label="Un de plus">${I.plus}</button></div>
        <button class="gros" data-fajout>Ajouter · <span class="disp">${F(choix.prix * f.qte)}</span></button>
      </div>` : ""}
    </div>
  </div>`;
  chargerPhotos();
}

function blocLignes(ls, modifiable) {
  return `<div class="boite">${ls.map(l => {
    const g = groupeDe(l.produit) || { nom: l.produit, photo: "" };
    return `<div class="ligne">${phHTML(l.produit, g.photo)}
      <div class="n"><b>${esc(l.produit)}</b><span>${modifiable ? F(l.prix) : `${l.qte} × ${F(l.prix)}`}</span></div>
      ${modifiable ? `<div class="mini"><button data-moins="${esc(l.produit)}" aria-label="Retirer un ${esc(l.produit)}">−</button><b>${l.qte}</b><button data-plus="${esc(l.produit)}" aria-label="Ajouter un ${esc(l.produit)}">+</button></div>` : `<b>${F(l.qte * l.prix)}</b>`}
    </div>`;
  }).join("")}</div>`;
}

function vuePanier() {
  const ls = lignes();
  if (!ls.length) { ST.vue = "menu"; return vueMenu(); }
  const m = form.mode;
  const L = livraison();
  const mobile = form.paie === "mobile";
  return `
  <header class="entete"><button class="rond" data-vue="menu" aria-label="Retour au menu">${I.retour}</button><h1>Ma commande</h1></header>
  ${blocLignes(ls, true)}
  <div class="sec"><span class="lab">Comment être servi ?</span>
    <div class="modes">${MODES.map(([k, l, i]) => `<button class="mode ${m === k ? "on" : ""}" data-mode="${k}" aria-pressed="${m === k}">${I[i]}${l}</button>`).join("")}</div>
    ${m === "sur place" ? `<label class="lab2" for="f-table">Numéro de table</label><input class="champ" id="f-table" inputmode="numeric" maxlength="10" value="${esc(form.table)}" placeholder="ex. 4">` : ""}
    ${m === "livraison" ? blocLivraison() : ""}
  </div>
  ${blocPaiement()}
  <div class="sec"><span class="lab">Vos coordonnées</span>
    <label class="lab2" for="f-nom" style="margin-top:0">Votre nom</label><input class="champ" id="f-nom" maxlength="60" autocomplete="name" value="${esc(form.nom)}" placeholder="ex. Awa">
    <label class="lab2" for="f-tel">Téléphone ${m === "livraison" ? "" : "(facultatif)"}</label><input class="champ" id="f-tel" type="tel" maxlength="30" autocomplete="tel" value="${esc(form.tel)}" placeholder="ex. 70 00 00 00">
    <label class="lab2" for="f-note">Une précision ? (facultatif)</label><input class="champ" id="f-note" maxlength="300" value="${esc(form.note)}" placeholder="ex. sans piment, bien cuit…">
  </div>
  ${ST.err ? `<div class="alerte" role="alert">${esc(ST.err)}</div>` : ""}
  <div style="height:140px"></div>
  <div class="total-bas"><div class="in">
    <div class="det"><span>Plats ${F(total())}${m === "livraison" ? ` + livraison ${L.connu ? F(frais()) : "à confirmer"}` : ""}</span><span>${mobile ? "Mobile Money" : form.paie === "especes" ? "Espèces" : ""}</span></div>
    <button class="gros" data-envoyer ${ST.envoi ? "disabled" : ""}><span>${ST.envoi ? "Envoi…" : mobile ? "Commander et payer" : "Envoyer la commande"}</span><span class="disp">${F(total() + frais())}</span></button>
  </div></div>`;
}

function blocLivraison() {
  const L = livraison();
  let t;
  if (ST.geo === "attente") t = `<b>Recherche de votre position…</b><span>Restez sur cette page quelques secondes.</span>`;
  else if (form.pos) t = `<b>Position partagée${L.connu ? ` · ${L.d < 1 ? "moins d'1" : L.d.toFixed(1).replace(".", ",")} km` : ""}</b><span>${L.connu ? `${L.km} km × ${F(prixKm())} = ${F(L.frais)} de livraison` : `Frais : ${F(prixKm())} par km, confirmés par le restaurant`}</span>`;
  else t = `<b>Partager ma position</b><span>Pour calculer la livraison (${F(prixKm())} par km)</span>`;
  return `<button class="carte-geo ${form.pos ? "ok" : ""}" data-geo><span class="pin">${I.pin}</span><span class="t">${t}</span>${form.pos ? `<span style="font-weight:700;font-size:13px;text-decoration:underline">Changer</span>` : ""}</button>
  ${ST.geo && ST.geo !== "attente" ? `<div class="alerte" style="margin:10px 0 0">${esc(ST.geo)}</div>` : ""}
  <label class="lab2" for="f-adr">Adresse ou repère</label><input class="champ" id="f-adr" maxlength="200" value="${esc(form.adresse)}" placeholder="Quartier, rue, couleur du portail…">`;
}

function blocPaiement() {
  const ops = operateurs();
  if (!ops.length) { form.paie = "especes"; return ""; }
  const sel = (k) => (k === "especes" ? form.paie === "especes" : form.paie === "mobile" && (form.op || ops[0].k) === k);
  const opt = (k, nom, sous) => `<button class="payopt ${sel(k) ? "on" : ""}" data-payopt="${k}" aria-pressed="${sel(k)}"><span class="r" aria-hidden="true"></span><span class="t"><b>${esc(nom)}</b><span>${esc(sous)}</span></span></button>`;
  return `<div class="sec"><span class="lab">Paiement</span><div class="pay">
    ${ops.map(o => opt(o.k, o.nom, `Payer tout de suite avec ${o.ussd}`)).join("")}
    ${opt("especes", "Espèces", form.mode === "livraison" ? "À la livraison" : "Au restaurant")}
  </div></div>`;
}

const ETATS = {
  nouvelle: ["Commande envoyée", "Le restaurant a reçu votre commande et va la confirmer."],
  acceptee: ["En préparation", "Le restaurant cuisine votre commande."],
  servie: ["Bon appétit !", "Merci d'avoir choisi WON HOUSE."],
};
function etapesDe(c) {
  const liv = c.mode === "livraison", emp = c.mode === "à emporter";
  return [
    ["nouvelle", "Commande envoyée"],
    ["acceptee", "Acceptée, en préparation"],
    ["prete", liv ? "Prête, le livreur part" : emp ? "Prête, venez la chercher" : "Prête, on vous sert"],
    ["servie", liv ? "Livrée" : "Servie"],
  ];
}
function vueSuivi() {
  const c = ST.suivi;
  if (!c) return `<header class="entete"><button class="rond" data-vue="menu" aria-label="Retour au menu">${I.retour}</button></header><div class="vide">Chargement de la commande…</div>`;
  const refusee = c.statut === "refusee";
  const et = etapesDe(c);
  const idx = Math.max(0, et.findIndex(e => e[0] === c.statut));
  const finie = c.statut === "servie";
  let titre, desc;
  if (refusee) { titre = "Commande refusée"; desc = c.motif || "Le restaurant ne peut pas préparer cette commande."; }
  else if (c.statut === "prete") { titre = et[2][1]; desc = c.mode === "livraison" ? "Votre commande arrive bientôt." : "Votre commande est prête !"; }
  else [titre, desc] = ETATS[c.statut] || ETATS.nouvelle;
  const at = c.at && c.at.toDate ? c.at.toDate() : null;
  const hh = at ? at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  return `
  <header class="suivi-tete">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <button class="rond" data-vue="menu" aria-label="Retour au menu">${I.retour}</button>
      <span style="font-size:13px;color:var(--night-muted)">Se met à jour tout seul</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px"><small>Commande n°</small><span class="code">${esc(c.code || "")}</span></div>
    <div style="display:flex;flex-direction:column;gap:10px" aria-live="polite">
      <span class="etat-titre">${esc(titre)}</span>
      <div class="prog ${refusee ? "ko" : ""}" aria-hidden="true">${et.map((e, i) => `<i class="${!refusee && i <= idx ? "f" : ""}"></i>`).join("")}</div>
      <span style="color:var(--night-muted);font-size:13.5px">${esc(desc)}</span>
    </div>
  </header>
  ${refusee ? "" : `<div class="etapes">${et.map((e, i) => {
    const f = i < idx || finie || (i === idx && i === 0);
    const now = i === idx && !finie;
    return `<div class="etape ${f || now ? "f" : ""} ${now ? "now" : ""}"><div class="col"><span class="pt">${f || now ? I.ok : ""}</span>${i < et.length - 1 ? `<span class="trait"></span>` : ""}</div><div class="t">${esc(e[1])}${i === 0 && hh ? ` <span style="color:var(--muted);font-weight:500">· ${hh}</span>` : ""}</div></div>`;
  }).join("")}</div>`}
  ${refusee ? "" : blocPayer(c)}
  <div class="sec"><span class="lab">Détail</span></div>
  <div style="margin-top:-14px">${blocLignes((c.items || []), false)}</div>
  <div class="boite" style="padding:2px 12px">
    ${c.mode === "livraison" ? `<div class="ligne"><span class="n"><span>Livraison${c.distanceKm ? ` (${c.distanceKm} km)` : ""}</span></span><b>${c.frais ? F(c.frais) : "à confirmer"}</b></div>` : ""}
    <div class="ligne"><span class="n"><b>À payer</b></span><b class="disp" style="font-size:18px">${F(c.aPayer ?? c.total)}</b></div>
  </div>
  <p class="note pad">${esc(c.mode || "")}${c.table ? " · table " + esc(c.table) : ""}${c.adresse ? " · " + esc(c.adresse) : ""}</p>
  <div class="duo">
    ${ST.menu?.tel ? `<a class="lien" href="tel:${esc(ST.menu.tel)}">${I.tel} Appeler</a>` : `<button class="lien" data-vue="mes">Mes commandes</button>`}
    <button class="lien noir" data-vue="menu">Recommander</button>
  </div>`;
}

function blocPayer(c) {
  const p = c.paiement;
  if (!p || p.mode !== "mobile") return "";
  const montant = F(c.aPayer ?? c.total);
  const nomOp = p.operateur === "moov" ? "Moov Money" : "Orange Money";
  if (p.etat === "confirme") return `<div class="info-pay ok">${I.okGros}<span class="t"><b>Paiement reçu</b><span>Le restaurant a bien reçu ${montant}. Merci !</span></span></div>`;
  if (p.etat === "declare") return `<div class="info-pay">${I.horloge}<span class="t"><b>Paiement ${esc(nomOp)} déclaré</b><span>Réf. ${esc(p.ref)} · le restaurant vérifie la réception de ${montant}</span></span></div>`;
  const ops = operateurs();
  const op = ops.find(o => o.k === form.op) || ops[0];
  if (!op) return `<div class="info-pay">${I.horloge}<span class="t"><b>Paiement Mobile Money</b><span>Le restaurant vous contactera.</span></span></div>`;
  return `<div class="payer">
    ${p.etat === "refuse" ? `<div class="alerte" style="margin:0 0 12px">Le restaurant n'a pas trouvé votre paiement. Vérifiez la référence ou appelez le restaurant.</div>` : ""}
    <h3>Payer ${montant}</h3>
    ${ops.length > 1 ? `<div class="modes" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px">${ops.map(o => `<button class="mode ${o.k === op.k ? "on" : ""}" style="height:48px" data-op="${o.k}">${esc(o.nom)}</button>`).join("")}</div>` : ""}
    <ol>
      <li>Touchez le bouton ci-dessous : votre téléphone compose <b>${esc(op.ussd)}</b>. Appuyez sur Appeler.</li>
      <li>Choisissez <b>Transfert d'argent</b>, puis envoyez <b>${montant}</b> au <b>${esc(op.numero)}</b>${ST.menu?.paiement?.nom ? ` (${esc(ST.menu.paiement.nom)})` : ""}.</li>
      <li>Vous recevez un SMS : recopiez sa <b>référence</b> ci-dessous.</li>
    </ol>
    <a class="gros" style="width:100%" href="${telUssd(op.ussd)}">Ouvrir ${esc(op.nom)} (${esc(op.ussd)})</a>
    <button class="lien" data-copier="${esc(op.numero)}">${I.copier} Copier le numéro ${esc(op.numero)}</button>
    <label class="lab2" for="p-num">Numéro qui a payé</label><input class="champ" id="p-num" type="tel" maxlength="30" value="${esc(form.payNum)}" placeholder="ex. 70 00 00 00">
    <label class="lab2" for="p-ref">Référence du SMS</label><input class="champ" id="p-ref" maxlength="40" value="${esc(form.payRef)}" placeholder="ex. CI241012.1530.A12345">
    ${ST.payErr ? `<div class="alerte" style="margin:10px 0 0">${esc(ST.payErr)}</div>` : ""}
    <button class="gros" style="width:100%;margin-top:14px;background:var(--good)" data-paye ${ST.payEnvoi ? "disabled" : ""}>${ST.payEnvoi ? "Envoi…" : "J'ai payé"}</button>
  </div>`;
}

function vueMes() {
  return `
  <header class="entete"><button class="rond" data-vue="menu" aria-label="Retour au menu">${I.retour}</button><h1>Mes commandes</h1></header>
  <div class="sec" style="margin-top:14px">
  ${ST.commandes.length ? ST.commandes.map(c => `<button class="mes" data-suivre="${esc(c.id)}"><b>N° ${esc(c.code)}</b><span>${new Date(c.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${F(c.total)}</span></button>`).join("") : `<div class="vide">Pas encore de commande.</div>`}
  </div>`;
}

let dernierN = 0;
function barre() {
  const b = $("#barre");
  const n = nbArticles();
  if (ST.vue !== "menu" || !n || !ST.menu?.ouvert) { b.hidden = true; dernierN = n; return; }
  b.hidden = false;
  b.innerHTML = `<button data-vue="panier" class="${n !== dernierN ? "pop" : ""}">${I.sac}<span class="l"><b>${n} article${n > 1 ? "s" : ""}</b><span>Voir ma commande</span></span><span class="p">${F(total())}</span></button>`;
  dernierN = n;
}

function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
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
      ? "Position refusée. Autorisez la localisation pour ce site (icône à côté de l'adresse), ou écrivez un repère."
      : "Position introuvable. Activez la localisation (GPS) du téléphone puis réessayez, ou écrivez un repère.";
    render();
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
}

async function declarerPaiement() {
  lireForm();
  const op = operateurs().find(o => o.k === form.op) || operateurs()[0];
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
    if (ST.vue === "suivi") { lireForm(); render(); }
  }, () => { if (ST.vue === "suivi") { ST.suivi = ST.suivi || { code: "?", statut: "nouvelle", items: [], total: 0 }; render(); } });
}

async function envoyer() {
  lireForm();
  ST.err = "";
  const items = lignes();
  if (!items.length) return;
  if (!form.mode) { ST.err = "Choisissez : sur place, à emporter ou livraison."; render(); return; }
  if (form.mode === "sur place" && !form.table.trim()) { ST.err = "Indiquez votre numéro de table."; render(); return; }
  if (form.mode === "livraison" && !form.pos && !form.adresse.trim()) { ST.err = "Pour la livraison, partagez votre position ou écrivez un repère."; render(); return; }
  if (operateurs().length && !form.paie) { ST.err = "Choisissez le paiement : Mobile Money ou espèces."; render(); return; }
  if (!form.nom.trim()) { ST.err = "Indiquez votre nom pour qu'on vous appelle quand c'est prêt."; render(); return; }
  if (form.mode === "livraison" && !form.tel.trim()) { ST.err = "Pour la livraison, indiquez votre téléphone."; render(); return; }
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

function ajouter(nom, n) {
  const p = parNom(nom); if (!p || !dispo(p) || !ST.menu?.ouvert) return;
  ST.panier[nom] = Math.max(0, Math.min(50, (ST.panier[nom] || 0) + n));
}

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-voile]")) { ST.fiche = null; fiche(); return; }
  const t = e.target.closest("[data-plus],[data-moins],[data-vue],[data-mode],[data-envoyer],[data-suivre],[data-geo],[data-payopt],[data-op],[data-copier],[data-paye],[data-rub],[data-ouvrir],[data-fermer],[data-taille],[data-fq],[data-fajout]");
  if (!t) return;
  const d = t.dataset;
  if (d.fermer !== undefined) { ST.fiche = null; fiche(); return; }
  if (d.ouvrir) { const g = groupeDe(d.ouvrir); if (g) { ST.fiche = { groupe: g.nom, choix: "", qte: 1 }; fiche(); } return; }
  if (d.taille) { if (ST.fiche) { ST.fiche.choix = d.taille; fiche(); } return; }
  if (d.fq) { if (ST.fiche) { ST.fiche.qte = Math.max(1, Math.min(20, ST.fiche.qte + Number(d.fq))); fiche(); } return; }
  if (d.fajout !== undefined) {
    if (ST.fiche) { ajouter(ST.fiche.choix, ST.fiche.qte); const n = ST.fiche.qte, nom = ST.fiche.choix; ST.fiche = null; render(); toast(`${n} × ${nom} ajouté${n > 1 ? "s" : ""}`); }
    return;
  }
  if (d.rub) { ST.rub = d.rub; render(); return; }
  if (d.geo !== undefined) { demanderPosition(); return; }
  if (d.payopt) { lireForm(); if (d.payopt === "especes") form.paie = "especes"; else { form.paie = "mobile"; form.op = d.payopt; } ST.err = ""; render(); return; }
  if (d.op) { lireForm(); form.op = d.op; render(); return; }
  if (d.copier) { const n = d.copier; (navigator.clipboard ? navigator.clipboard.writeText(n) : Promise.reject()).then(() => toast("Numéro copié"), () => { t.textContent = n; }); return; }
  if (d.paye !== undefined) { declarerPaiement(); return; }
  if (d.plus) { lireForm(); ajouter(d.plus, 1); render(); }
  else if (d.moins) { lireForm(); ST.panier[d.moins] = Math.max(0, (ST.panier[d.moins] || 0) - 1); render(); }
  else if (d.mode) { lireForm(); form.mode = d.mode; ST.err = ""; render(); }
  else if (d.envoyer !== undefined) envoyer();
  else if (d.suivre) suivre(d.suivre);
  else if (d.vue) {
    if (ST.vue === "panier") lireForm();
    if (d.vue !== "suivi") { stopSuivi && stopSuivi(); stopSuivi = null; }
    ST.err = ""; ST.vue = d.vue; render(); scrollTo(0, 0);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "q") { ST.q = e.target.value.slice(0, 40); const l = $("#liste"); if (l) { l.innerHTML = listeHTML(); chargerPhotos(); } }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ST.fiche) { ST.fiche = null; fiche(); } });

/* ---------------- démarrage ---------------- */
onSnapshot(doc(fs, "public", "menu"), (s) => {
  ST.menu = s.exists() ? s.data() : { produits: [], ouvert: false };
  ST.err = "";
  if (ST.vue === "panier") lireForm();
  const actif = document.activeElement && document.activeElement.id === "q";
  render();
  if (actif) { const q = $("#q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}, () => { ST.err = "Menu indisponible. Vérifiez votre connexion internet."; render(); });
render();
