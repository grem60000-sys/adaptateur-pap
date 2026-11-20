// =====================================================================
//  Adaptateur PAP — application professeur
//  JR Enseignement — v3
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  FONDS, POLICES, parametres, tiersTemps, echapper, svgFigure, pourImpression,
  cssCharte, hydraterDom, htmlPourStockage, corrigeHtml, pageAutonomeV3, docxDepuisDom,
} from "./rendu.js?v=2026112002";

const SUPA_URL = "https://mfykdfytbnajxfnkjhwz.supabase.co";
const SUPA_CLE = "sb_publishable_B7kioKokXxrUihZ3FBofYQ_T49C21eO";
const sb = createClient(SUPA_URL, SUPA_CLE);

const NIVEAUX_CLASSE = [
  ["college_6_5", "Collège 6e-5e"], ["college_4_3", "Collège 4e-3e"], ["seconde", "Seconde"],
  ["premiere", "Première"], ["terminale", "Terminale"], ["bts", "BTS"], ["superieur_autre", "Autre post-bac"],
];
const NIVEAUX_ADAPT = { forme: "Forme seule", consignes: "Forme + consignes", fond: "Forme + fond", hors_document: "Hors document" };

const E = {
  user: null, admin: false, etabs: [], etab: null, role: null,
  referentiel: [], prereglages: [], profilsNiveau: {}, vue: "classes",
};

// ---------------------------------------------------------------------
//  Utilitaires d'interface
// ---------------------------------------------------------------------
function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v; // uniquement pour du HTML échappé par rendu.js
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const e of enfants.flat(Infinity)) {
    if (e == null || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return el;
}
const $app = () => document.getElementById("app");
function afficher(...enfants) { const a = $app(); a.replaceChildren(...enfants.flat()); window.scrollTo(0, 0); }
function message(type, texte) { return h("div", { class: `msg ${type}` }, texte); }
function chargement(texte) { return h("p", { class: "doux" }, h("span", { class: "chargement" }), " ", texte); }
async function essai(fn, zone) {
  try { return await fn(); } catch (e) {
    console.error(e);
    const m = message("err", e.message ?? String(e));
    if (zone) zone.replaceChildren(m); else $app().prepend(m);
    return null;
  }
}
function verifier({ data, error }) { if (error) throw new Error(error.message); return data; }
const dateFr = (d) => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

async function appelMoteur(corps) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${SUPA_URL}/functions/v1/moteur`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPA_CLE, Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(corps),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.erreur ?? (r.status === 546 || r.status === 504 ? "Le traitement a dépassé le temps autorisé." : `Erreur du moteur (${r.status})`));
    e.statut = r.status;
    throw e;
  }
  return j;
}

function telecharger(nom, contenu, type) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  const a = h("a", { href: URL.createObjectURL(blob), download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const nomFichier = (s) => String(s ?? "document").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").slice(0, 60);

// ---------------------------------------------------------------------
//  Connexion
// ---------------------------------------------------------------------
function vueConnexion(note) {
  document.getElementById("nav").replaceChildren();
  document.getElementById("etab").replaceChildren();
  document.getElementById("compte").textContent = "";
  const email = h("input", { type: "email", autocomplete: "email", placeholder: "prenom.nom@exemple.fr" });
  const mdp = h("input", { type: "password", autocomplete: "current-password" });
  const zone = h("div");
  const go = async (mode) => {
    zone.replaceChildren(chargement("Un instant…"));
    let r;
    if (mode === "connexion") r = await sb.auth.signInWithPassword({ email: email.value.trim(), password: mdp.value });
    else if (mode === "inscription") r = await sb.auth.signUp({ email: email.value.trim(), password: mdp.value, options: { emailRedirectTo: location.origin + location.pathname } });
    else r = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
    if (r.error) return zone.replaceChildren(message("err", traduireErreurAuth(r.error.message)));
    if (mode === "inscription") return zone.replaceChildren(message("ok", "Compte créé. Ouvrez l’e-mail de confirmation reçu, puis revenez vous connecter."));
    if (mode === "oubli") return zone.replaceChildren(message("ok", "Si ce compte existe, un e-mail de réinitialisation vient d’être envoyé."));
    demarrer();
  };
  afficher(h("div", { class: "carte", style: "max-width:440px;margin:2rem auto" },
    h("h2", {}, "Connexion"),
    h("p", { class: "doux" }, "Outil d’adaptation des évaluations et des cours aux plans d’accompagnement personnalisés. Aucun nom d’élève n’y est enregistré."),
    note ? message("info", note) : null,
    h("label", {}, "Adresse e-mail"), email,
    h("label", {}, "Mot de passe (8 caractères minimum)"), mdp,
    h("div", { class: "ligne", style: "margin-top:1rem" },
      h("button", { class: "btn", onclick: () => go("connexion") }, "Se connecter"),
      h("button", { class: "btn sec", onclick: () => go("inscription") }, "Créer un compte"),
      h("button", { class: "btn discret", onclick: () => go("oubli") }, "Mot de passe oublié")),
    zone));
}
function traduireErreurAuth(m) {
  if (/Invalid login/i.test(m)) return "Adresse ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Confirmez d’abord votre adresse grâce à l’e-mail reçu.";
  if (/at least/i.test(m)) return "Le mot de passe est trop court.";
  if (/already registered/i.test(m)) return "Un compte existe déjà avec cette adresse.";
  return m;
}

// ---------------------------------------------------------------------
//  Démarrage
// ---------------------------------------------------------------------
async function demarrer() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return vueConnexion();
  E.user = session.user;
  document.getElementById("compte").textContent = E.user.email;
  afficher(chargement("Ouverture de votre espace…"));
  await sb.rpc("accepter_invitations");
  const [admin, membres, ref, pre, niv] = await Promise.all([
    sb.rpc("est_admin_plateforme"),
    sb.from("membres").select("role, etablissement_id, etablissements(id, nom, niveau_qualite)").eq("user_id", E.user.id),
    sb.from("referentiel_adaptations").select("*").eq("actif", true).order("ordre"),
    sb.from("prereglages").select("*").order("ordre"),
    sb.from("profils_niveau").select("*"),
  ]);
  E.admin = !!admin.data;
  E.etabs = (membres.data ?? []).map((m) => ({ id: m.etablissement_id, nom: m.etablissements?.nom, role: m.role, qualite: m.etablissements?.niveau_qualite }));
  E.referentiel = ref.data ?? [];
  E.prereglages = pre.data ?? [];
  E.profilsNiveau = Object.fromEntries((niv.data ?? []).map((n) => [n.niveau, n]));
  if (!E.etabs.length) return vueSansEtablissement();
  const memo = localStorage.getItem("pap_etab");
  choisirEtab(E.etabs.find((e) => e.id === memo) ?? E.etabs[0]);
}

function choisirEtab(e) {
  E.etab = e; E.role = e.role;
  try { localStorage.setItem("pap_etab", e.id); } catch { /* navigateur privé */ }
  const zone = document.getElementById("etab");
  if (E.etabs.length > 1) {
    const s = h("select", { onchange: (ev) => choisirEtab(E.etabs.find((x) => x.id === ev.target.value)) },
      E.etabs.map((x) => h("option", { value: x.id, selected: x.id === e.id }, x.nom)));
    zone.replaceChildren(s);
  } else zone.replaceChildren(h("span", {}, e.nom));
  menu();
  aller(E.vue);
}

function menu() {
  const items = [["classes", "Mes classes"], ["documents", "Évaluations et cours"]];
  if (E.role === "referent" || E.admin) items.push(["etablissement", "Établissement"]);
  if (E.admin) items.push(["admin", "Administration"]);
  items.push(["deconnexion", "Déconnexion"]);
  document.getElementById("nav").replaceChildren(...items.map(([v, t]) =>
    h("button", { class: E.vue === v ? "actif" : "", onclick: () => aller(v) }, t)));
}

function aller(v) {
  if (v === "deconnexion") { sb.auth.signOut().then(() => vueConnexion()); return; }
  E.vue = v; menu();
  ({ classes: vueClasses, documents: vueDocuments, etablissement: vueEtablissement, admin: vueAdmin }[v] ?? vueClasses)();
}

function vueSansEtablissement() {
  document.getElementById("nav").replaceChildren(h("button", { onclick: () => aller("deconnexion") }, "Déconnexion"));
  if (E.admin) {
    const nom = h("input", { value: "JR Enseignement" });
    const zone = h("div");
    return afficher(h("div", { class: "carte", style: "max-width:560px;margin:2rem auto" },
      h("h2", {}, "Créer votre établissement"),
      h("p", {}, "Vous êtes administrateur de la plateforme. Créez l’espace où vous travaillerez avec vos collègues testeurs. Vous en serez le référent."),
      h("label", {}, "Nom"), nom,
      h("button", { class: "btn", style: "margin-top:1rem", onclick: () => essai(async () => {
        verifier(await sb.rpc("creer_etablissement", { p_nom: nom.value.trim(), p_email_referent: E.user.email }));
        demarrer();
      }, zone) }, "Créer"), zone));
  }
  afficher(h("div", { class: "carte", style: "max-width:560px;margin:2rem auto" },
    h("h2", {}, "Bienvenue"),
    h("p", {}, "Votre compte n’est encore rattaché à aucun établissement."),
    h("p", { class: "doux" }, "Demandez au référent de votre établissement de vous inviter avec cette adresse : ", h("b", {}, E.user.email), ". Reconnectez-vous ensuite.")));
}

// ---------------------------------------------------------------------
//  Classes, élèves, profils
// ---------------------------------------------------------------------
async function vueClasses() {
  afficher(chargement("Chargement des classes…"));
  const classes = verifier(await sb.from("classes").select("*, eleves(count)").eq("etablissement_id", E.etab.id).order("created_at"));
  const nom = h("input", { placeholder: "Ex. : Terminale STMG 2" });
  const niveau = h("select", {}, NIVEAUX_CLASSE.map(([v, t]) => h("option", { value: v }, t)));
  const matiere = h("input", { placeholder: "Ex. : Management" });
  const zone = h("div");
  afficher(
    h("h2", {}, "Mes classes"),
    classes.length ? h("div", { class: "grille" }, classes.map((c) => h("div", { class: "carte" },
      h("h3", { style: "margin-top:0" }, c.nom),
      h("p", { class: "doux" }, `${NIVEAUX_CLASSE.find((n) => n[0] === c.niveau)?.[1]} · ${c.matiere} · ${c.annee_scolaire}`),
      h("p", {}, `${c.eleves?.[0]?.count ?? 0} élève(s) avec un PAP`),
      h("div", { class: "ligne" }, h("button", { class: "btn", onclick: () => vueClasse(c) }, "Ouvrir"),
        h("button", { class: "btn discret", onclick: () => supprimerClasse(c, vueClasses) }, "Supprimer"))))) : h("p", { class: "vide" }, "Aucune classe pour l’instant."),
    h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Nouvelle classe"),
      h("div", { class: "grille" }, h("div", {}, h("label", {}, "Nom"), nom), h("div", {}, h("label", {}, "Niveau"), niveau), h("div", {}, h("label", {}, "Matière"), matiere)),
      h("button", { class: "btn", style: "margin-top:1rem", onclick: () => essai(async () => {
        if (!nom.value.trim() || !matiere.value.trim()) throw new Error("Indiquez le nom et la matière.");
        verifier(await sb.from("classes").insert({ etablissement_id: E.etab.id, professeur_id: E.user.id, nom: nom.value.trim(), niveau: niveau.value, matiere: matiere.value.trim() }));
        vueClasses();
      }, zone) }, "Créer la classe"), zone));
}

async function supprimerClasse(c, ensuite) {
  await essai(async () => {
    const { count } = await sb.from("eleves").select("id", { count: "exact", head: true }).eq("classe_id", c.id);
    if (!confirm(`Supprimer la classe « ${c.nom} » ?\n\nSeront supprimés : ${count ?? 0} élève(s), leurs profils PAP et toutes leurs adaptations.\nLes documents déposés sont conservés (supprimables dans « Évaluations et cours »).\n\nCette suppression est définitive.`)) return;
    verifier(await sb.from("classes").delete().eq("id", c.id));
    ensuite();
  });
}

async function vueClasse(c) {
  afficher(chargement("Chargement…"));
  const eleves = verifier(await sb.from("eleves").select("*, profils_eleves(*)").eq("classe_id", c.id).order("identifiant"));
  const ident = h("input", { placeholder: "Ex. : TSTMG-A3", maxlength: 30 });
  const zone = h("div");
  afficher(
    h("div", { class: "ligne", style: "justify-content:space-between" },
      h("button", { class: "btn discret", onclick: vueClasses }, "← Mes classes"),
      h("button", { class: "btn discret", onclick: () => supprimerClasse(c, vueClasses) }, "Supprimer la classe")),
    h("h2", {}, c.nom),
    message("info", "Chaque élève est enregistré sous un identifiant. N’utilisez jamais son nom ni ses initiales. Gardez la correspondance sur papier ou dans votre propre fichier."),
    h("div", { class: "carte" },
      eleves.length ? h("table", { class: "liste" },
        h("tr", {}, h("th", {}, "Identifiant"), h("th", {}, "Adaptations"), h("th", {}, "Niveau maximal"), h("th", {}, "")),
        eleves.map((e) => {
          const p = e.profils_eleves ?? {};
          return h("tr", {},
            h("td", {}, h("b", {}, e.identifiant)),
            h("td", {}, `${(p.codes ?? []).length} cochée(s)`),
            h("td", {}, NIVEAUX_ADAPT[p.niveau_max ?? "fond"]),
            h("td", {}, h("button", { class: "btn sec", onclick: () => vueProfil(c, e) }, "Profil PAP"), " ",
              h("button", { class: "btn discret", onclick: () => essai(async () => {
                if (!confirm(`Supprimer l’élève ${e.identifiant}, son profil PAP et toutes ses adaptations ?\n\nCette suppression est définitive.`)) return;
                verifier(await sb.from("eleves").delete().eq("id", e.id)); vueClasse(c);
              }) }, "Supprimer")));
        })) : h("p", { class: "vide" }, "Aucun élève pour l’instant."),
      h("h3", {}, "Ajouter un élève"),
      h("div", { class: "ligne" }, ident, h("button", { class: "btn", onclick: () => essai(async () => {
        const v = ident.value.trim();
        if (!v) throw new Error("Saisissez un identifiant.");
        const e = verifier(await sb.from("eleves").insert({ classe_id: c.id, identifiant: v }).select().single());
        verifier(await sb.from("profils_eleves").insert({ eleve_id: e.id }));
        vueProfil(c, { ...e, profils_eleves: null });
      }, zone) }, "Ajouter")), zone));
}

function vueProfil(c, eleve) {
  const p0 = eleve.profils_eleves ?? {};
  const coches = new Set(p0.codes ?? []);
  const prefs = { police: "Arial", taille: 14, fond: "blanc", interligne: 1.5, ...(p0.preferences ?? {}) };
  let niveauMax = p0.niveau_max ?? "fond";
  const apercu = h("div", { class: "apercu" });
  const compteur = h("span", { class: "pastille" });

  const majApercu = () => {
    compteur.textContent = `${coches.size} adaptation(s) cochée(s)`;
    const p = parametres([...coches], prefs, E.profilsNiveau[c.niveau]);
    const exemple = `<section class="exo" data-exo="1"><header><span>Exercice 1 — Le résultat de l’entreprise</span><span>…… / 2 points</span></header>
<div class="encadre"><b class="t">Document 1</b>En 2025, l’entreprise a réalisé un chiffre d’affaires de 125 000 €. Ses charges s’élèvent à 98 000 €.</div>
<p><b>Calcule</b> le résultat de l’entreprise.</p><div class="check">Résultat = chiffre d’affaires − charges</div><div class="lignes" data-n="2"></div></section>`;
    apercu.replaceChildren(apercuDocument(exemple, p, { min: "0" }));
  };

  const familles = [...new Set(E.referentiel.map((a) => a.famille))];
  const blocsFamilles = familles.map((f) => {
    const items = E.referentiel.filter((a) => a.famille === f);
    const nb = () => items.filter((a) => coches.has(a.code)).length;
    const resume = h("span", { class: "doux" });
    const majResume = () => { resume.textContent = nb() ? ` — ${nb()} cochée(s)` : ""; };
    majResume();
    return { el: h("details", { class: "famille" },
      h("summary", {}, `${f} — ${items[0].famille_libelle}`, resume),
      h("div", { class: "items" }, items.map((a) => h("label", { class: "item-adapt", style: "font-weight:normal" },
        h("input", { type: "checkbox", "data-code": a.code, checked: coches.has(a.code), onchange: (ev) => {
          ev.target.checked ? coches.add(a.code) : coches.delete(a.code); majResume(); majApercu();
        } }),
        h("div", {}, h("b", {}, `${a.code} · ${a.libelle} `), h("span", { class: `pastille ${a.niveau}` }, NIVEAUX_ADAPT[a.niveau]),
          a.confirmation_requise ? h("span", { class: "pastille", style: "margin-left:.3rem" }, "sensible") : null,
          h("div", { class: "regle" }, a.regles)))))), maj: majResume };
  });
  const rafraichirCases = () => {
    document.querySelectorAll("input[data-code]").forEach((i) => { i.checked = coches.has(i.dataset.code); });
    blocsFamilles.forEach((b) => b.maj()); majApercu();
  };

  const police = h("select", { onchange: (e) => { prefs.police = e.target.value; majApercu(); } },
    Object.keys(POLICES).map((k) => h("option", { value: k, selected: prefs.police === k }, k)));
  const taille = h("input", { type: "number", min: 12, max: 22, value: prefs.taille, oninput: (e) => { prefs.taille = +e.target.value; majApercu(); } });
  const interligne = h("select", { onchange: (e) => { prefs.interligne = +e.target.value; majApercu(); } },
    [1.5, 1.75, 2].map((v) => h("option", { value: v, selected: +prefs.interligne === v }, String(v).replace(".", ","))));
  const fonds = h("div", { class: "fonds" }, Object.entries(FONDS).map(([k, col]) => h("button", {
    title: k, style: `background:${col}`, class: prefs.fond === k ? "sel" : "",
    onclick: (e) => { prefs.fond = k; fonds.querySelectorAll("button").forEach((b) => b.classList.remove("sel")); e.target.classList.add("sel"); majApercu(); },
  })));
  const niveau = h("select", { onchange: (e) => { niveauMax = e.target.value; } },
    ["forme", "consignes", "fond"].map((v) => h("option", { value: v, selected: niveauMax === v }, NIVEAUX_ADAPT[v])));
  const zone = h("div");

  afficher(
    h("button", { class: "btn discret", onclick: () => vueClasse(c) }, `← ${c.nom}`),
    h("h2", {}, `Profil PAP — ${eleve.identifiant}`),
    h("div", { class: "deux" },
      h("div", {},
        h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "1. Préréglage (facultatif)"),
          h("p", { class: "doux" }, "Un préréglage pré-coche les adaptations fréquentes. Ajustez ensuite case par case selon le PAP. Le besoin n’est pas enregistré."),
          h("div", { class: "chips" }, E.prereglages.map((pr) => h("button", { title: pr.a_verifier ? `À vérifier : ${pr.a_verifier}` : "",
            onclick: () => { pr.codes.forEach((x) => coches.add(x)); rafraichirCases(); } }, `+ ${pr.libelle}`))),
          h("button", { class: "btn discret", onclick: () => { coches.clear(); rafraichirCases(); } }, "Tout décocher")),
        h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "3. Préférences de l’élève"),
          h("label", {}, "Police (si A1 cochée)"), police,
          h("label", {}, "Taille en points (si A2 cochée)"), taille,
          h("label", {}, "Interligne (si A3 cochée)"), interligne,
          h("label", {}, "Couleur de fond (si A10 cochée)"), fonds,
          h("label", {}, "Niveau d’adaptation maximal autorisé"), niveau),
        h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "4. Aperçu"), apercu)),
      h("div", {},
        h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "2. Adaptations du PAP ", compteur),
          blocsFamilles.map((b) => b.el)),
        h("div", { class: "ligne" }, h("button", { class: "btn", onclick: () => essai(async () => {
          verifier(await sb.from("profils_eleves").upsert({ eleve_id: eleve.id, codes: [...coches].sort(), preferences: prefs, niveau_max: niveauMax }));
          zone.replaceChildren(message("ok", "Profil enregistré."));
          setTimeout(() => vueClasse(c), 700);
        }, zone) }, "Enregistrer le profil"), zone))));
  majApercu();
}

// ---------------------------------------------------------------------
//  Documents : liste et parcours guidé (v3 — le modèle compose le document)
// ---------------------------------------------------------------------
const ETAPES = ["Déposer", "Vérifier la lecture", "Choisir les élèves", "Générer", "Propositions et ajustements", "Exporter"];
function bandeau(n) {
  return h("div", { class: "etapes" }, ETAPES.map((t, i) => h("span", { class: i < n ? "fait" : i === n ? "cour" : "" }, `${i + 1}. ${t}`)));
}
const LIENS_POLICES = `<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;600&display=swap" rel="stylesheet"><link href="https://fonts.cdnfonts.com/css/opendyslexic" rel="stylesheet">`;
const estV3 = (v) => v?.contenu?.format === "html";

async function vueDocuments() {
  afficher(chargement("Chargement des documents…"));
  const attente = await verifierLots();
  const enPrep = new Map(); attente.forEach((l) => enPrep.set(l.document_id, (enPrep.get(l.document_id) ?? 0) + 1));
  const docs = verifier(await sb.from("documents").select("id, titre, type, statut, created_at, classes(nom)").eq("etablissement_id", E.etab.id).order("created_at", { ascending: false }));
  const statuts = { depose: "Déposé", lu: "À vérifier", structure_validee: "Lecture validée", en_adaptation: "En adaptation", termine: "Terminé" };
  afficher(
    h("div", { class: "ligne", style: "justify-content:space-between" }, h("h2", {}, "Évaluations et cours"),
      h("button", { class: "btn", onclick: () => etapeDepot() }, "+ Nouveau document")),
    docs.length ? h("div", { class: "carte" }, h("table", { class: "liste" },
      h("tr", {}, h("th", {}, "Titre"), h("th", {}, "Type"), h("th", {}, "Classe"), h("th", {}, "État"), h("th", {}, "Créé le"), h("th", {}, "")),
      docs.map((d) => h("tr", {}, h("td", {}, h("b", {}, d.titre)), h("td", {}, d.type === "cours" ? "Cours" : "Évaluation"),
        h("td", {}, d.classes?.nom ?? "—"), h("td", {}, enPrep.get(d.id) ? `En préparation (${enPrep.get(d.id)} élève${enPrep.get(d.id) > 1 ? "s" : ""})` : statuts[d.statut]), h("td", {}, dateFr(d.created_at)),
        h("td", {}, h("span", { class: "ligne" }, h("button", { class: "btn sec", onclick: () => reprendre(d.id) }, "Ouvrir"),
          h("button", { class: "btn discret", onclick: () => supprimerDocument(d, vueDocuments) }, "Supprimer"))))))) :
      h("p", { class: "vide" }, "Aucun document. Commencez par déposer une évaluation ou un cours."));
}

async function supprimerDocument(d, ensuite) {
  await essai(async () => {
    if (!confirm(`Supprimer « ${d.titre} » ?\n\nSeront supprimés : le fichier original, la lecture, toutes les adaptations des élèves et leur historique.\n\nCette suppression est définitive.`)) return;
    const dossier = `${E.user.id}/${d.id}`;
    const { data: fichiers } = await sb.storage.from("documents").list(dossier);
    if (fichiers?.length) verifier(await sb.storage.from("documents").remove(fichiers.map((f) => `${dossier}/${f.name}`)));
    verifier(await sb.from("documents").delete().eq("id", d.id));
    ensuite();
  });
}

async function chargerDoc(id) { return verifier(await sb.from("documents").select("*, classes(*)").eq("id", id).single()); }
async function reprendre(id) {
  const d = await chargerDoc(id);
  if (d.statut === "depose" || d.structure?.version !== 3) return etapeLecture(d);
  if (d.statut === "lu") return etapeVerification(d);
  if (d.statut === "structure_validee") return etapeEleves(d);
  return etapePropositions(d);
}

// Étape 1 : dépôt
async function etapeDepot() {
  const classes = verifier(await sb.from("classes").select("*").eq("etablissement_id", E.etab.id).order("nom"));
  if (!classes.length) return afficher(bandeau(0), message("info", "Créez d’abord une classe et ses élèves."), h("button", { class: "btn", onclick: () => aller("classes") }, "Mes classes"));
  const type = h("select", {}, h("option", { value: "evaluation" }, "Évaluation"), h("option", { value: "cours" }, "Cours"));
  const titre = h("input", { placeholder: "Ex. : Évaluation chapitre 3 — les nombres relatifs" });
  const classe = h("select", {}, classes.map((c) => h("option", { value: c.id }, c.nom)));
  const fichier = h("input", { type: "file", accept: ".pdf,.docx,.txt,.html,image/*" });
  const texte = h("textarea", { placeholder: "… ou collez ici le texte du document", style: "min-height:8rem" });
  const zone = h("div");
  afficher(bandeau(0), h("div", { class: "carte" },
    h("h2", {}, "Déposer un document"),
    h("div", { class: "grille" }, h("div", {}, h("label", {}, "Type"), type), h("div", {}, h("label", {}, "Classe"), classe)),
    h("label", {}, "Titre"), titre,
    h("label", {}, "Fichier : PDF (le plus fidèle), photo ou scan, Word (.docx)"), fichier,
    h("p", { class: "doux" }, "Le PDF et la photo sont lus tels quels, figures comprises. Pour un fichier Word avec des figures, enregistrez-le plutôt en PDF. PowerPoint : enregistrez-le en PDF."),
    texte,
    h("button", { class: "btn", style: "margin-top:1rem", onclick: () => essai(async () => {
      if (!titre.value.trim()) throw new Error("Donnez un titre au document.");
      const f = fichier.files[0];
      if (!f && !texte.value.trim()) throw new Error("Choisissez un fichier ou collez un texte.");
      zone.replaceChildren(chargement("Envoi du document…"));
      let blob, ext, ftype;
      if (!f) { blob = new Blob([texte.value], { type: "text/plain" }); ext = "txt"; ftype = "texte"; }
      else {
        ext = f.name.toLowerCase().split(".").pop();
        if (ext === "docx") {
          await chargerScript("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js");
          const r = await window.mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
          blob = new Blob([r.value], { type: "text/html" }); ext = "html"; ftype = "texte";
        } else if (ext === "pdf") { blob = f; ftype = "pdf"; }
        else if (f.type.startsWith("image/")) { blob = f; ftype = ["png", "webp", "gif"].includes(ext) ? ext : "jpg"; }
        else if (["txt", "html"].includes(ext)) { blob = f; ftype = "texte"; }
        else throw new Error("Format non pris en charge. Utilisez PDF, une image, Word ou du texte.");
      }
      if (blob.size > 25 * 1024 * 1024) throw new Error("Fichier trop lourd (25 Mo maximum).");
      const doc = verifier(await sb.from("documents").insert({
        etablissement_id: E.etab.id, professeur_id: E.user.id, classe_id: classe.value, type: type.value, titre: titre.value.trim(),
      }).select().single());
      const chemin = `${E.user.id}/${doc.id}/source.${ext}`;
      verifier(await sb.storage.from("documents").upload(chemin, blob, { upsert: true, contentType: blob.type || undefined }));
      verifier(await sb.from("documents").update({ fichier_path: chemin, fichier_type: ftype }).eq("id", doc.id));
      etapeLecture(await chargerDoc(doc.id));
    }, zone) }, "Envoyer et lire le document"), zone));
}
function chargerScript(src) {
  return new Promise((ok, ko) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = h("script", { src }); s.onload = ok; s.onerror = () => ko(new Error("Chargement d’une bibliothèque impossible."));
    document.head.append(s);
  });
}

// Visionneuse de l'original, tel que déposé
async function visionneuse(d) {
  const boite = h("div", { class: "original" }, chargement("Affichage de l’original…"));
  essai(async () => {
    const { data: f, error } = await sb.storage.from("documents").download(d.fichier_path);
    if (error) throw new Error("Fichier original introuvable.");
    const t = d.fichier_type;
    if (t === "pdf") {
      const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      boite.replaceChildren();
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1.6 });
        const cv = h("canvas", { width: Math.round(vp.width), height: Math.round(vp.height), style: "width:100%;height:auto;display:block;margin-bottom:.6rem;box-shadow:0 1px 4px rgba(0,0,0,.15);background:#fff" });
        boite.append(cv);
        await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      }
    } else if (t === "texte") {
      const fr = h("iframe", { sandbox: "", style: "width:100%;height:70vh;border:0;background:#fff" });
      fr.srcdoc = `<!DOCTYPE html><meta charset="utf-8"><body style="font-family:Arial;padding:1rem">${/\.html$/.test(d.fichier_path) ? await f.text() : `<pre style="white-space:pre-wrap">${echapper(await f.text())}</pre>`}</body>`;
      boite.replaceChildren(fr);
    } else {
      boite.replaceChildren(h("img", { src: URL.createObjectURL(f), alt: "Document original", style: "width:100%;height:auto;display:block" }));
    }
  }, boite);
  return boite;
}

// Étape 2a : analyse par le moteur
async function etapeLecture(d) {
  const zone = h("div", {}, chargement("Lecture du document… (20 à 60 secondes)"));
  afficher(bandeau(1), h("div", { class: "carte" }, h("h2", {}, d.titre), zone));
  const r = await essai(() => appelMoteur({ action: "analyser", document_id: d.id }), zone);
  if (r) etapeVerification(await chargerDoc(d.id));
  else zone.append(h("button", { class: "btn sec", onclick: () => etapeLecture(d) }, "Réessayer"));
}

// Étape 2b : vérification — l'original tel quel, et ce que l'outil en a compris
async function etapeVerification(d) {
  const s = structuredClone(d.structure ?? {});
  s.exercices = s.exercices ?? [];
  const mot = d.type === "cours" ? "Partie" : "Exercice";
  const zone = h("div");
  const liste = h("div");
  const total = h("b");
  const majTotal = () => { total.textContent = s.exercices.reduce((t, e) => t + (Number(e.points) || 0), 0); };
  const dessiner = () => {
    liste.replaceChildren(...s.exercices.map((ex, i) => h("div", { class: "q-edit" },
      h("div", { class: "ligne" },
        h("b", {}, mot), h("input", { value: ex.numero ?? "", style: "width:4rem", oninput: (e) => { ex.numero = e.target.value; } }),
        h("input", { value: ex.titre ?? "", style: "flex:1;min-width:180px", oninput: (e) => { ex.titre = e.target.value; } }),
        d.type === "cours" ? null : h("span", {}, h("input", { type: "number", value: ex.points ?? "", style: "width:4.5rem", oninput: (e) => { ex.points = e.target.value === "" ? null : +e.target.value; majTotal(); } }), " pts"),
        h("label", { class: "ligne", style: "font-weight:normal;margin:0" }, h("input", { type: "checkbox", checked: !!ex.figures, onchange: (e) => { ex.figures = e.target.checked; } }), "figure"),
        h("button", { class: "btn discret", title: "Retirer", onclick: () => { s.exercices.splice(i, 1); dessiner(); majTotal(); } }, "✕")),
      ex.resume ? h("div", { class: "doux", style: "margin-top:.2rem" }, ex.resume) : null)));
  };
  dessiner(); majTotal();
  const original = await visionneuse(d);
  afficher(bandeau(1),
    h("h2", {}, `Vérifier la lecture — ${d.titre}`),
    message("info", `À gauche, votre document tel que vous l’avez déposé. À droite, le découpage compris par l’outil : chaque ${mot.toLowerCase()} sera adapté à partir de l’original, figures comprises.`),
    h("div", { style: "display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,1fr);gap:1rem;align-items:start" },
      h("div", { class: "carte", style: "max-height:80vh;overflow:auto;background:#F3F4F6" }, original),
      h("div", {},
        (s.alertes_lecture ?? []).length ? h("div", { class: "msg err" }, h("b", {}, "À vérifier sur l’original : "), h("ul", {}, s.alertes_lecture.map((a) => h("li", {}, a)))) : null,
        h("div", { class: "carte" },
          h("label", {}, "Titre"), h("input", { value: s.titre ?? "", oninput: (e) => { s.titre = e.target.value; } }),
          h("div", { class: "grille" },
            h("div", {}, h("label", {}, "Matière"), h("input", { value: s.matiere ?? "", oninput: (e) => { s.matiere = e.target.value; } })),
            h("div", {}, h("label", {}, "Durée (minutes)"), h("input", { type: "number", value: s.duree_minutes ?? "", oninput: (e) => { s.duree_minutes = e.target.value === "" ? null : +e.target.value; } }))),
          d.type === "cours" ? null : h("p", {}, "Total des points lus : ", total, s.total_points != null ? ` (indiqué sur le sujet : ${s.total_points})` : "")),
        h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, `${mot}s`), liste,
          h("button", { class: "btn discret", onclick: () => { s.exercices.push({ numero: String(s.exercices.length + 1), titre: "", points: null }); dessiner(); } }, `+ ajouter un${d.type === "cours" ? "e partie" : " exercice"}`)),
        h("div", { class: "ligne" },
          h("button", { class: "btn", onclick: () => essai(async () => {
            if (!s.exercices.length) throw new Error(`Il faut au moins un${d.type === "cours" ? "e partie" : " exercice"}.`);
            if (s.exercices.some((e) => !String(e.numero ?? "").trim())) throw new Error("Chaque ligne doit avoir un numéro.");
            if (d.type !== "cours" && s.exercices.some((e) => e.points != null)) s.total_points = s.exercices.reduce((t, e) => t + (Number(e.points) || 0), 0);
            verifier(await sb.from("documents").update({ structure: s, statut: "structure_validee" }).eq("id", d.id));
            etapeEleves(await chargerDoc(d.id));
          }, zone) }, "Valider et choisir les élèves"),
          h("button", { class: "btn sec", onclick: () => etapeLecture(d) }, "Relire le document")), zone)));
}

// Étape 3 : élèves concernés
async function etapeEleves(d) {
  if (!d.classe_id) return afficher(bandeau(2), message("err", "La classe de ce document a été supprimée. Déposez le document à nouveau pour une autre classe, ou supprimez-le."),
    h("button", { class: "btn discret", onclick: () => supprimerDocument(d, vueDocuments) }, "Supprimer ce document"));
  afficher(chargement("Chargement des élèves…"));
  const eleves = verifier(await sb.from("eleves").select("*, profils_eleves(*)").eq("classe_id", d.classe_id).order("identifiant"));
  const deja = verifier(await sb.from("document_eleves").select("*").eq("document_id", d.id));
  const choix = new Map(deja.map((x) => [x.eleve_id, x.niveau_max]));
  const zone = h("div");
  if (!eleves.length) return afficher(bandeau(2), message("info", "Cette classe n’a pas encore d’élève avec un profil PAP."), h("button", { class: "btn", onclick: () => vueClasse(d.classes) }, "Ajouter des élèves"));
  afficher(bandeau(2), h("h2", {}, `Élèves concernés — ${d.titre}`),
    message("info", "Une proposition est générée par élève, au niveau choisi. Vous pourrez en demander d’autres ensuite."),
    h("div", { class: "carte" }, h("table", { class: "liste" },
      h("tr", {}, h("th", {}, ""), h("th", {}, "Élève"), h("th", {}, "Adaptations du PAP"), h("th", {}, "Niveau d’adaptation")),
      eleves.map((e) => {
        const p = e.profils_eleves ?? {};
        const sel = h("select", { onchange: (ev) => { if (choix.has(e.id)) choix.set(e.id, ev.target.value); } },
          ["forme", "consignes", "fond"].map((v) => h("option", { value: v, selected: (choix.get(e.id) ?? p.niveau_max ?? "consignes") === v }, NIVEAUX_ADAPT[v])));
        return h("tr", {},
          h("td", {}, h("input", { type: "checkbox", checked: choix.has(e.id), onchange: (ev) => { ev.target.checked ? choix.set(e.id, sel.value) : choix.delete(e.id); } })),
          h("td", {}, h("b", {}, e.identifiant)),
          h("td", { class: "doux" }, (p.codes ?? []).join(" ") || "aucune — profil à remplir"),
          h("td", {}, sel));
      }))),
    h("p", { class: "doux" }, "Forme seule : mêmes mots, présentation adaptée. Forme + consignes : consignes reformulées et découpées. Forme + fond : allègements prévus par le PAP (compétences conservées)."),
    h("div", { class: "ligne" },
      h("button", { class: "btn", onclick: () => lancerGeneration(false) }, "Générer maintenant"),
      h("button", { class: "btn sec", onclick: () => lancerGeneration(true) }, "Mode économique : prêt dans l’heure, moitié prix")),
    h("p", { class: "doux" }, "Le mode économique produit exactement le même document. Il est traité en différé : vous pouvez fermer la page et revenir plus tard (en général moins d’une heure, 24 h au maximum)."),
    zone);
  function lancerGeneration(differe) {
    return essai(async () => {
      if (!choix.size) throw new Error("Cochez au moins un élève.");
      verifier(await sb.from("document_eleves").delete().eq("document_id", d.id));
      verifier(await sb.from("document_eleves").insert([...choix].map(([eleve_id, niveau_max]) => ({ document_id: d.id, eleve_id, niveau_max }))));
      const demandes = eleves.filter((e) => choix.has(e.id)).map((e) => ({ eleve: e, niveau: choix.get(e.id) }));
      differe ? etapeDiffere(d, demandes) : etapeGeneration(d, demandes);
    }, zone);
  }
}

// Étape 4 : génération (exercices par groupes, appels en parallèle)
function limiteur(n) {
  let actifs = 0; const file = [];
  const suivant = () => {
    if (actifs >= n || !file.length) return;
    actifs++; const { fn, ok, ko } = file.shift();
    fn().then(ok, ko).finally(() => { actifs--; suivant(); });
  };
  return (fn) => new Promise((ok, ko) => { file.push({ fn, ok, ko }); suivant(); });
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function appelMoteurRelance(corps, surAttente) {
  for (let i = 0; ; i++) {
    try { return await appelMoteur(corps); } catch (e) {
      const passager = [429, 503, 504, 546].includes(e.statut) || e.statut == null;
      if (!passager || i >= 3) throw e;
      surAttente?.(`nouvel essai dans ${20 * (i + 1)} s`);
      await attendre(20000 * (i + 1));
    }
  }
}
function groupesExercices(exos) {
  // Parties plus grosses = moins de relectures de l'original. Plus petites en qualité maximale (réflexion plus longue).
  const max = E.etab?.qualite === "maximale" ? 3 : 4;
  const g = []; let cur = [], poids = 0;
  for (const e of exos) {
    const w = e.figures ? 2 : 1;
    if (cur.length && poids + w > max) { g.push(cur); cur = []; poids = 0; }
    cur.push(String(e.numero)); poids += w;
  }
  if (cur.length) g.push(cur);
  return g;
}
function horsDocument(codes) {
  const parCode = new Map(E.referentiel.map((a) => [a.code, a]));
  return (codes ?? []).map((c) => parCode.get(c)).filter((a) => a?.niveau === "hors_document").map((a) => ({ code: a.code, libelle: a.libelle, regles: a.regles }));
}

async function genererPourEleve(d, eleve, niveau, file, surProgres) {
  const groupes = groupesExercices(d.structure?.exercices ?? []);
  if (!groupes.length) throw new Error("Aucun exercice dans la lecture validée.");
  let faits = 0;
  surProgres(`0 / ${groupes.length} parties`);
  const lancer = (i) => file(async () => {
    const r = await appelMoteurRelance({ action: "adapter_partie", document_id: d.id, eleve_id: eleve.id, niveau, exercices: groupes[i], premiere: i === 0 },
      (m) => surProgres(`${faits} / ${groupes.length} parties — service occupé, ${m}`));
    faits++; surProgres(`${faits} / ${groupes.length} parties`);
    return r;
  });
  // La première partie part seule : elle met l'original et la charte en cache, les suivantes les relisent à 10 % du prix.
  const premiere = await lancer(0);
  const parties = [premiere, ...(await Promise.all(groupes.slice(1).map((_, k) => lancer(k + 1))))];
  const application = new Map();
  parties.flatMap((p) => p.application ?? []).forEach((a) => {
    const x = application.get(a.code);
    application.set(a.code, x ? { ...x, applique: x.applique || a.applique, detail: [x.detail, a.detail].filter(Boolean).join(" ; ") } : a);
  });
  const contenu = { format: "html", html: parties.map((p) => p.html).join("\n"), corrige: parties.flatMap((p) => p.corrige ?? []) };
  const precedentes = verifier(await sb.from("versions").select("id, parent_id").eq("document_id", d.id).eq("eleve_id", eleve.id));
  verifier(await sb.from("versions").update({ choisie: false }).eq("document_id", d.id).eq("eleve_id", eleve.id));
  return verifier(await sb.from("versions").insert({
    document_id: d.id, eleve_id: eleve.id, niveau, contenu,
    numero_proposition: precedentes.filter((v) => !v.parent_id).length + 1,
    resume_modifications: parties.flatMap((p) => p.resume_modifications ?? []),
    controle: { application: [...application.values()], alertes: parties.flatMap((p) => p.alertes ?? []), hors_document: horsDocument(eleve.profils_eleves?.codes) },
    auteur: "ia", choisie: true,
  }).select().single());
}

async function etapeGeneration(d, demandes, retour) {
  const lignes = new Map(demandes.map(({ eleve }) => [eleve.id, h("li", {}, `${eleve.identifiant} — en attente`)]));
  const nGroupes = groupesExercices(d.structure?.exercices ?? []).length;
  afficher(bandeau(3), h("h2", {}, "Génération des adaptations"),
    message("info", `Le document est adapté en ${nGroupes} partie(s) par élève, traitées en parallèle à partir de l’original. Comptez une à trois minutes par élève. Restez sur cette page.`),
    h("div", { class: "carte" }, h("ul", {}, [...lignes.values()])));
  verifier(await sb.from("documents").update({ statut: "en_adaptation" }).eq("id", d.id));
  const file = limiteur(3);
  let erreurs = 0;
  await Promise.all(demandes.map(async ({ eleve, niveau }) => {
    const li = lignes.get(eleve.id);
    const etat = (t) => li.replaceChildren(h("span", { class: "chargement" }), ` ${eleve.identifiant} (${NIVEAUX_ADAPT[niveau]}) — ${t}`);
    try {
      await genererPourEleve(d, eleve, niveau, file, etat);
      li.replaceChildren(`✓ ${eleve.identifiant} — adaptation prête`);
    } catch (err) {
      erreurs++;
      li.replaceChildren(h("span", { style: "color:var(--erreur)" }, `✗ ${eleve.identifiant} — ${err.message}`));
    }
  }));
  if (erreurs) {
    $app().append(h("div", { class: "ligne" },
      h("button", { class: "btn", onclick: () => etapePropositions(d, retour) }, "Voir les adaptations"),
      h("button", { class: "btn sec", onclick: () => etapeGeneration(d, demandes, retour) }, "Relancer")));
  } else etapePropositions(await chargerDoc(d.id), retour ?? demandes[0]?.eleve.id);
}

// Mode économique : envoi différé, puis récupération à la prochaine visite
async function etapeDiffere(d, demandes, retour) {
  const groupes = groupesExercices(d.structure?.exercices ?? []);
  const lignes = new Map(demandes.map(({ eleve }) => [eleve.id, h("li", {}, `${eleve.identifiant} — envoi…`)]));
  afficher(bandeau(3), h("h2", {}, "Mode économique"), h("div", { class: "carte" }, h("ul", {}, [...lignes.values()])));
  verifier(await sb.from("documents").update({ statut: "en_adaptation" }).eq("id", d.id));
  let erreurs = 0;
  for (const { eleve, niveau } of demandes) {
    const li = lignes.get(eleve.id);
    try {
      await appelMoteurRelance({ action: "adapter_differe", document_id: d.id, eleve_id: eleve.id, niveau, groupes });
      li.replaceChildren(`✓ ${eleve.identifiant} (${NIVEAUX_ADAPT[niveau]}) — en préparation`);
    } catch (err) { erreurs++; li.replaceChildren(h("span", { style: "color:var(--erreur)" }, `✗ ${eleve.identifiant} — ${err.message}`)); }
  }
  $app().append(
    message(erreurs ? "err" : "ok", erreurs ? "Certains envois ont échoué : relancez-les." : "C’est lancé. Vous pouvez fermer cette page : les adaptations apparaîtront dans ce document, en général en moins d’une heure."),
    h("div", { class: "ligne" },
      h("button", { class: "btn", onclick: () => vueDocuments() }, "Retour aux documents"),
      h("button", { class: "btn sec", onclick: () => etapePropositions(d, retour) }, "Voir le document")));
}

/** Vérifie les adaptations différées en attente (toutes, ou celles d'un document). */
async function verifierLots(documentId) {
  let q = sb.from("lots_ia").select("id, document_id, eleve_id, created_at").eq("statut", "en_cours");
  if (documentId) q = q.eq("document_id", documentId);
  const { data: lots } = await q;
  const enCours = [];
  for (const l of lots ?? []) {
    try {
      const r = await appelMoteur({ action: "verifier_differe", lot_id: l.id });
      if (r.statut === "en_cours") enCours.push(l);
    } catch { enCours.push(l); }
  }
  return enCours;
}

// Aperçu fidèle (iframe isolée, même rendu que le PDF)
function apercuDocument(html, p, { editable = false, min = "60vh" } = {}) {
  const fr = h("iframe", { title: "Aperçu du document adapté", style: `width:100%;border:0;display:block;min-height:${min};background:#fff` });
  fr.srcdoc = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">${LIENS_POLICES}<style>body{margin:0;background:${p.fond}}${cssCharte(p)}.sujet{padding:1.2cm 1.6cm;max-width:21cm;margin:0 auto;box-sizing:border-box}</style></head><body><div class="sujet">${html}</div></body></html>`;
  const ajuster = () => { try { fr.style.height = fr.contentDocument.documentElement.scrollHeight + 20 + "px"; } catch { /* rien */ } };
  fr.addEventListener("load", () => {
    const racine = fr.contentDocument.querySelector(".sujet");
    hydraterDom(racine);
    if (editable) racine.setAttribute("contenteditable", "true");
    fr.contentDocument.fonts?.ready.then(ajuster);
    new ResizeObserver(ajuster).observe(fr.contentDocument.body);
    ajuster();
  });
  fr.racine = () => fr.contentDocument?.querySelector(".sujet");
  return fr;
}

function fusionnerSections(html, sections) {
  const t = document.createElement("template");
  t.innerHTML = html;
  const r = t.content;
  for (const s of sections) {
    const n = document.createElement("template"); n.innerHTML = s.html;
    if (s.exo === "entete") {
      const premier = r.querySelector("section.exo");
      if (premier) {
        [...r.childNodes].filter((x) => x !== premier && (x.compareDocumentPosition(premier) & Node.DOCUMENT_POSITION_FOLLOWING)).forEach((x) => x.remove());
        premier.before(n.content);
      } else r.prepend(n.content);
    } else {
      const cible = r.querySelector(`section.exo[data-exo="${CSS.escape(s.exo)}"]`);
      if (cible) cible.replaceWith(n.content); else r.append(n.content);
    }
  }
  const div = document.createElement("div"); div.append(r);
  return div.innerHTML;
}
function fusionnerCorrige(ancien = [], nouveau = []) {
  const m = new Map(ancien.map((c) => [String(c.exercice), c]));
  nouveau.forEach((c) => m.set(String(c.exercice), c));
  return [...m.values()];
}

// Étape 5 : propositions, aperçu, ajustements
async function etapePropositions(d, eleveActif) {
  afficher(chargement("Chargement des adaptations…"));
  const attente = await verifierLots(d.id);
  const liens = verifier(await sb.from("document_eleves").select("niveau_max, eleves(*, profils_eleves(*))").eq("document_id", d.id));
  const eleves = liens.map((l) => ({ ...l.eleves, niveau_doc: l.niveau_max })).filter((e) => e.id).sort((a, b) => a.identifiant.localeCompare(b.identifiant));
  if (!eleves.length) return etapeEleves(d);
  const actif = eleves.find((e) => e.id === eleveActif) ?? eleves[0];
  const versions = verifier(await sb.from("versions").select("*").eq("document_id", d.id).eq("eleve_id", actif.id).order("created_at")).filter(estV3);
  const profil = actif.profils_eleves ?? {};
  const p = parametres(profil.codes ?? [], profil.preferences ?? {}, E.profilsNiveau[d.classes?.niveau]);
  const racines = versions.filter((v) => !v.parent_id);
  let courante = versions.find((v) => v.choisie) ?? versions.at(-1);
  const feuille = h("div", { class: "feuille", style: "max-height:none;background:#E9ECF1;padding:.6rem" });
  const panneau = h("div");
  let cadre = null;

  const montrer = (v, editable = false) => {
    courante = v;
    cadre = apercuDocument(v.contenu.html, p, { editable });
    feuille.replaceChildren(cadre);
    editable ? panneauEdition() : panneauDroit();
  };
  const enregistrer = async (contenu, extra) => {
    verifier(await sb.from("versions").update({ choisie: false }).eq("document_id", d.id).eq("eleve_id", actif.id));
    verifier(await sb.from("versions").insert({
      document_id: d.id, eleve_id: actif.id, numero_proposition: courante.numero_proposition, niveau: courante.niveau,
      contenu, controle: courante.controle, parent_id: courante.id, choisie: true, ...extra,
    }));
    etapePropositions(d, actif.id);
  };

  const carteControle = (v) => {
    const c = v.controle ?? {};
    return h("div", { class: "controle" },
      (c.application ?? []).length ? h("details", {}, h("summary", {}, "Adaptations du PAP appliquées"),
        c.application.map((a) => h("div", { class: a.applique ? "ok" : "ko" }, `${a.applique ? "✓" : "⚠"} ${a.code}${a.detail ? " — " + a.detail : ""}`))) : null,
      (c.alertes ?? []).map((a) => h("div", { class: "ko" }, `⚠ ${a}`)));
  };

  function panneauDroit() {
    const msg = h("textarea", { placeholder: "Ex. : à l’exercice 3, mets les nombres dans un tableau ; agrandis la droite graduée ; ajoute un exemple…" });
    const retenir = h("input", { type: "checkbox" });
    const zone = h("div");
    const autreNiveau = h("select", { style: "width:auto" }, ["forme", "consignes", "fond"].map((n) => h("option", { value: n, selected: n === (courante?.niveau ?? actif.niveau_doc) }, NIVEAUX_ADAPT[n])));
    panneau.replaceChildren(
      h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Propositions"),
        racines.map((v) => h("div", { class: `prop ${courante && (courante.id === v.id || courante.numero_proposition === v.numero_proposition) ? "choisie" : ""}`, style: "margin-bottom:.6rem" },
          h("div", { class: "ligne", style: "justify-content:space-between" },
            h("span", {}, h("b", {}, `n° ${v.numero_proposition} `), h("span", { class: `pastille ${v.niveau}` }, NIVEAUX_ADAPT[v.niveau])),
            h("button", { class: "btn discret", onclick: () => montrer(versions.filter((x) => x.numero_proposition === v.numero_proposition).at(-1)) }, "Voir")),
          h("ul", { class: "doux", style: "margin:.3rem 0" }, (v.resume_modifications ?? []).slice(0, 5).map((r) => h("li", {}, r))),
          carteControle(v))),
        h("div", { class: "ligne", style: "margin-top:.4rem" }, autreNiveau,
          h("button", { class: "btn sec", onclick: () => etapeGeneration(d, [{ eleve: actif, niveau: autreNiveau.value }], actif.id) }, "Nouvelle proposition"),
          h("button", { class: "btn discret", title: "Même résultat, moitié prix, prêt dans l’heure", onclick: () => etapeDiffere(d, [{ eleve: actif, niveau: autreNiveau.value }], actif.id) }, "… en mode économique"))),
      courante ? h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Ajuster la version affichée"),
        h("p", { class: "doux" }, `${dateFr(courante.created_at)} — ${NIVEAUX_ADAPT[courante.niveau]}${courante.auteur === "professeur" ? " — modifiée à la main" : courante.parent_id ? " — ajustée" : ""}`),
        msg, h("label", { class: "ligne", style: "font-weight:normal" }, retenir, "Retenir cette préférence pour mes prochaines adaptations"),
        h("div", { class: "ligne", style: "margin-top:.5rem" },
          h("button", { class: "btn", onclick: () => essai(async () => {
            if (!msg.value.trim()) throw new Error("Écrivez l’ajustement souhaité.");
            zone.replaceChildren(chargement("Ajustement en cours… (30 à 90 secondes)"));
            if (retenir.checked) await memoriser(msg.value.trim());
            const r = await appelMoteurRelance({ action: "ajuster", version_id: courante.id, message: msg.value.trim() }, (m) => zone.replaceChildren(chargement(`Service occupé, ${m}…`)));
            if (!(r.sections ?? []).length) throw new Error((r.alertes ?? []).join(" ") || "Aucune modification proposée.");
            await sb.from("ajustements").insert({ version_id: courante.id, message: msg.value.trim() }).then(() => {}, () => {});
            await enregistrer(
              { format: "html", html: fusionnerSections(courante.contenu.html, r.sections), corrige: fusionnerCorrige(courante.contenu.corrige, r.corrige) },
              { auteur: "ia", resume_modifications: r.resume_modifications ?? [msg.value.trim()], controle: { ...courante.controle, alertes: [...(courante.controle?.alertes ?? []), ...(r.alertes ?? [])] } });
          }, zone) }, "Demander l’ajustement"),
          h("button", { class: "btn sec", onclick: () => montrer(courante, true) }, "Modifier à la main")),
        zone) : null,
      versions.length ? h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Historique"),
        versions.slice().reverse().map((v) => h("div", { class: "ligne", style: "justify-content:space-between;border-top:1px solid #EEF1F4;padding:.3rem 0" },
          h("span", { class: "doux" }, `${dateFr(v.created_at)} · n° ${v.numero_proposition} · ${NIVEAUX_ADAPT[v.niveau]}${v.auteur === "professeur" ? " · à la main" : v.parent_id ? " · ajustée" : ""}${v.choisie ? " · retenue" : ""}`),
          h("span", {}, h("button", { class: "btn discret", onclick: () => montrer(v) }, "Voir"),
            v.choisie ? null : h("button", { class: "btn discret", onclick: () => essai(async () => {
              verifier(await sb.from("versions").update({ choisie: false }).eq("document_id", d.id).eq("eleve_id", actif.id));
              verifier(await sb.from("versions").update({ choisie: true }).eq("id", v.id));
              etapePropositions(d, actif.id);
            }) }, "Retenir"),
            v.choisie ? null : h("button", { class: "btn discret", title: "Supprimer cette version", onclick: () => essai(async () => {
              if (!confirm("Supprimer cette version ? Cette suppression est définitive.")) return;
              verifier(await sb.from("versions").delete().eq("id", v.id));
              etapePropositions(d, actif.id);
            }) }, "✕"))))) : null,
      h("button", { class: "btn", onclick: () => etapeExport(d) }, "Passer à l’export →"));
  }

  function panneauEdition() {
    const zone = h("div");
    panneau.replaceChildren(h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Modification à la main"),
      h("p", { class: "doux" }, "Cliquez dans le document pour corriger un mot, une consigne, une valeur. Les figures se corrigent par une demande d’ajustement."),
      h("div", { class: "ligne" },
        h("button", { class: "btn", onclick: () => essai(async () => {
          const racine = cadre?.racine();
          if (!racine) throw new Error("Aperçu non chargé.");
          await enregistrer({ format: "html", html: htmlPourStockage(racine), corrige: courante.contenu.corrige ?? [] },
            { auteur: "professeur", resume_modifications: ["Modifiée à la main par le professeur"] });
        }, zone) }, "Enregistrer mes modifications"),
        h("button", { class: "btn sec", onclick: () => montrer(courante) }, "Annuler")), zone));
  }

  const attenteActif = attente.filter((l) => l.eleve_id === actif.id);
  const ident = new Map(eleves.map((e) => [e.id, e.identifiant]));
  const bandeauAttente = attente.length ? h("div", { class: "msg info" },
    `En préparation (mode économique) : ${attente.map((l) => `${ident.get(l.eleve_id) ?? "?"} depuis ${new Date(l.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`).join(", ")}. `,
    h("button", { class: "btn discret", onclick: () => etapePropositions(d, actif.id) }, "Vérifier maintenant")) : null;
  afficher(bandeau(4), h("h2", {}, `Adaptations — ${d.titre}`), bandeauAttente,
    h("div", { class: "onglets" }, eleves.map((e) => h("button", { class: e.id === actif.id ? "actif" : "", onclick: () => etapePropositions(d, e.id) }, e.identifiant)),
      h("button", { onclick: () => etapeEleves(d) }, "+ élèves")),
    versions.length ? h("div", { class: "deux" }, panneau, feuille) : attenteActif.length ? message("info", "L’adaptation de cet élève est en préparation (mode économique). Revenez plus tard : elle apparaîtra ici.") : h("div", {}, message("info", "Aucune adaptation pour cet élève."),
      h("button", { class: "btn", onclick: () => etapeGeneration(d, [{ eleve: actif, niveau: actif.niveau_doc ?? "consignes" }], actif.id) }, "Générer maintenant")));
  if (courante) montrer(courante); else if (versions.length) panneauDroit();
}

async function memoriser(texte) {
  const { data } = await sb.from("memoire_professeur").select("consignes").eq("professeur_id", E.user.id).maybeSingle();
  const liste = [...new Set([...(data?.consignes ?? []), texte])].slice(-30);
  await sb.from("memoire_professeur").upsert({ professeur_id: E.user.id, consignes: liste });
}

// Étape 6 : export
function htmlHydrate(html) {
  const t = document.createElement("template");
  t.innerHTML = String(html ?? "");
  hydraterDom(t.content);
  const div = document.createElement("div"); div.append(t.content);
  div.querySelectorAll("[contenteditable]").forEach((x) => x.removeAttribute("contenteditable"));
  return div.innerHTML;
}

async function etapeExport(d) {
  afficher(chargement("Préparation des exports…"));
  const liens = verifier(await sb.from("document_eleves").select("eleves(*, profils_eleves(*))").eq("document_id", d.id));
  const eleves = liens.map((l) => l.eleves).filter(Boolean).sort((a, b) => a.identifiant.localeCompare(b.identifiant));
  const versions = verifier(await sb.from("versions").select("*").eq("document_id", d.id).order("created_at")).filter(estV3);
  const niveauClasse = E.profilsNiveau[d.classes?.niveau];
  const versionDe = (e) => { const vs = versions.filter((v) => v.eleve_id === e.id); return vs.find((v) => v.choisie) ?? vs.at(-1); };
  const paramsDe = (e) => parametres(e.profils_eleves?.codes ?? [], e.profils_eleves?.preferences ?? {}, niveauClasse);
  const titre = d.structure?.titre || d.titre;

  const boutons = (v, p, e) => {
    const base = `${nomFichier(d.titre)}_${nomFichier(e.identifiant)}`;
    return h("span", { class: "ligne" },
      h("button", { class: "btn sec", onclick: () => imprimerV3(v.contenu.html, p, `${titre} — ${e.identifiant}`) }, "PDF"),
      h("button", { class: "btn sec", onclick: () => exporterWordV3(v.contenu.html, p, base) }, "Word"),
      h("button", { class: "btn sec", onclick: () => telecharger(`${base}.html`, pageAutonomeV3(htmlHydrate(v.contenu.html), p, titre), "text/html") }, "HTML"),
      (v.contenu.corrige ?? []).length ? h("button", { class: "btn discret", onclick: () => imprimerCorrige(v.contenu, titre, e.identifiant) }, "Corrigé") : null);
  };
  const original = async () => essai(async () => {
    const { data, error } = await sb.storage.from("documents").createSignedUrl(d.fichier_path, 600);
    if (error) throw new Error("Original introuvable.");
    window.open(data.signedUrl, "_blank");
  });

  afficher(bandeau(5), h("h2", {}, `Exporter — ${d.titre}`),
    message("info", "PDF : choisissez « Enregistrer au format PDF » dans la fenêtre d’impression (marges gérées par l’outil). HTML : version interactive (lecture vocale, règle de lecture, pas à pas selon le profil). Word : version modifiable."),
    h("div", { class: "carte" }, h("table", { class: "liste" },
      h("tr", {}, h("th", {}, "Version"), h("th", {}, "Niveau"), h("th", {}, "Exports")),
      h("tr", {}, h("td", {}, h("b", {}, "Version classe")), h("td", {}, "Originale"), h("td", {}, h("button", { class: "btn sec", onclick: original }, "Ouvrir l’original"))),
      eleves.map((e) => {
        const v = versionDe(e);
        return h("tr", {}, h("td", {}, h("b", {}, e.identifiant)), h("td", {}, v ? NIVEAUX_ADAPT[v.niveau] : "—"),
          h("td", {}, v ? boutons(v, paramsDe(e), e) : "Aucune version"));
      }))),
    h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Page de garde professeur"),
      h("p", { class: "doux" }, "Aménagements hors document (temps majoré, lecture des consignes, placement…) pour chaque élève. À ne pas distribuer."),
      h("button", { class: "btn", onclick: () => pageDeGarde(d, eleves, versionDe) }, "Imprimer la page de garde")),
    h("div", { class: "ligne" },
      h("button", { class: "btn discret", onclick: () => etapePropositions(d) }, "← Adaptations"),
      h("button", { class: "btn sec", onclick: () => essai(async () => { verifier(await sb.from("documents").update({ statut: "termine" }).eq("id", d.id)); vueDocuments(); }) }, "Marquer comme terminé")));
}

async function svgVersPng(svg) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
  const echelle = 2;
  const cv = h("canvas", { width: img.width * echelle, height: img.height * echelle });
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise((ok) => cv.toBlob(ok, "image/png"));
  return { data: new Uint8Array(await blob.arrayBuffer()), largeur: img.width, hauteur: img.height };
}

async function exporterWordV3(html, p, base) {
  await essai(async () => {
    const docx = await import("https://esm.sh/docx@9.5.1");
    const racine = document.createElement("div");
    racine.innerHTML = html;
    const images = new Map();
    for (const el of racine.querySelectorAll(".figure[data-fig]")) {
      try { images.set(el, await svgVersPng(svgFigure(JSON.parse(el.getAttribute("data-fig"))))); } catch { /* figure illisible */ }
    }
    telecharger(`${base}.docx`, await docx.Packer.toBlob(docxDepuisDom(docx, racine, p, images)));
  });
}

function fenetreImpression(titre, css, corps) {
  const w = window.open("", "_blank");
  if (!w) return alert("Autorisez les fenêtres pour cette page afin d’imprimer.");
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title>${LIENS_POLICES}
<style>body{margin:0}${css}</style></head><body>${corps}
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),400))<\/script></body></html>`);
  w.document.close();
}
function imprimerV3(html, p, titre) {
  fenetreImpression(titre, cssCharte(p), pourImpression(`<div class="sujet">${htmlHydrate(html)}</div>`, p));
}
function imprimerCorrige(contenu, titre, identifiant) {
  const p = parametres([], {}, null);
  fenetreImpression(`Corrigé — ${titre}`, cssCharte(p), pourImpression(corrigeHtml(contenu, titre, identifiant), p));
}

function pageDeGarde(d, eleves, versionDe) {
  const duree = d.structure?.duree_minutes;
  const blocs = eleves.map((e) => {
    const v = versionDe(e);
    const hd = v?.controle?.hors_document ?? horsDocument(e.profils_eleves?.codes);
    const codes = e.profils_eleves?.codes ?? [];
    const lignes = hd.map((a) => `<li><b>${echapper(a.code)} · ${echapper(a.libelle)}</b>${a.code === "H1" && duree ? ` — <b>${echapper(tiersTemps(duree))}</b> au lieu de ${echapper(duree)} min` : ""}<br><span style="color:#555">${echapper(a.regles)}</span></li>`).join("");
    return `<div style="border:1px solid #bbb;border-radius:8px;padding:.6em 1em;margin:.8em 0;break-inside:avoid">
<h3 style="margin:.2em 0">${echapper(e.identifiant)} <span style="font-weight:normal;color:#666">— ${v ? echapper(NIVEAUX_ADAPT[v.niveau]) : "pas de version"}</span></h3>
<p style="margin:.3em 0;color:#555">Adaptations du profil : ${echapper(codes.join(" ") || "aucune")}</p>
${lignes ? `<ul>${lignes}</ul>` : "<p>Aucun aménagement hors document.</p>"}</div>`;
  }).join("");
  const w = window.open("", "_blank");
  if (!w) return alert("Autorisez les fenêtres pour cette page afin d’imprimer.");
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Page de garde</title>
<style>body{font-family:Arial,sans-serif;margin:2cm;font-size:11pt}@page{size:A4;margin:1.5cm}</style></head><body>
<p style="color:#B3261E;font-weight:bold">Document professeur — ne pas distribuer</p>
<h1 style="font-size:18pt">${echapper(d.titre)}</h1><p>${echapper(d.classes?.nom ?? "")}${duree ? ` · Durée prévue : ${echapper(duree)} min` : ""}</p>
${blocs}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}

// ---------------------------------------------------------------------
//  Établissement (référent)
// ---------------------------------------------------------------------
async function vueEtablissement() {
  afficher(chargement("Chargement…"));
  const [etat, conso, etab, invitations] = await Promise.all([
    sb.rpc("etat_cle_api", { p_etab: E.etab.id }),
    sb.rpc("consommation_mois", { p_etab: E.etab.id }),
    sb.from("etablissements").select("*").eq("id", E.etab.id).single(),
    sb.from("invitations").select("*").eq("etablissement_id", E.etab.id).order("created_at"),
  ]);
  const cle = etat.data?.[0];
  const c = conso.data?.[0] ?? { nb_operations: 0, cout_eur: 0, plafond_eur: etab.data?.plafond_mensuel_eur };
  const champCle = h("input", { type: "password", autocomplete: "off", placeholder: "sk-ant-…" });
  const plafond = h("input", { type: "number", min: 0, step: 1, value: etab.data?.plafond_mensuel_eur ?? 30 });
  const email = h("input", { type: "email", placeholder: "collegue@exemple.fr" });
  const role = h("select", {}, h("option", { value: "professeur" }, "Professeur"), h("option", { value: "referent" }, "Référent"));
  const z1 = h("div"), z2 = h("div"), z3 = h("div");
  afficher(h("h2", {}, `Établissement — ${E.etab.nom}`),
    h("div", { class: "grille" },
      h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Clé API de l’établissement"),
        cle?.configuree ? message("ok", `Clé enregistrée (${cle.apercu}), mise à jour le ${dateFr(cle.mise_a_jour_le)}.`) : message("err", "Aucune clé : les professeurs ne peuvent pas encore adapter de document."),
        h("p", { class: "doux" }, "La clé est chiffrée dès l’enregistrement. Personne ne peut la relire, pas même vous. Elle ne sert qu’aux professeurs de cet établissement."),
        h("label", {}, cle?.configuree ? "Remplacer la clé" : "Coller la clé"), champCle,
        h("button", { class: "btn", style: "margin-top:.6rem", onclick: () => essai(async () => {
          verifier(await sb.rpc("definir_cle_api", { p_etab: E.etab.id, p_cle: champCle.value.trim() }));
          champCle.value = ""; vueEtablissement();
        }, z1) }, "Enregistrer la clé"), z1),
      h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Consommation du mois"),
        h("p", { style: "font-size:1.6rem;margin:.2rem 0" }, `${Number(c.cout_eur).toFixed(2)} €`),
        h("p", { class: "doux" }, `${c.nb_operations} opération(s) · plafond ${Number(c.plafond_eur ?? 0).toFixed(0)} € · estimation indicative`),
        h("label", {}, "Plafond mensuel (€)"), plafond,
        h("p", { style: "margin:.7rem 0 0" }, "Niveau de qualité : ", h("b", {}, QUALITES[etab.data?.niveau_qualite]?.nom ?? "—"),
          h("span", { class: "doux" }, " — fixé par JR Enseignement")),
        h("button", { class: "btn", style: "margin-top:.6rem", onclick: () => essai(async () => {
          verifier(await sb.from("etablissements").update({ plafond_mensuel_eur: +plafond.value }).eq("id", E.etab.id));
          z2.replaceChildren(message("ok", "Réglages enregistrés."));
        }, z2) }, "Enregistrer"), z2)),
    h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Collègues"),
      h("p", { class: "doux" }, "Le collègue invité crée son compte avec cette adresse ; il est rattaché automatiquement à sa première connexion."),
      h("div", { class: "ligne" }, email, role, h("button", { class: "btn", onclick: () => essai(async () => {
        verifier(await sb.rpc("inviter", { p_etab: E.etab.id, p_email: email.value.trim(), p_role: role.value }));
        vueEtablissement();
      }, z3) }, "Inviter")), z3,
      (invitations.data ?? []).length ? h("table", { class: "liste", style: "margin-top:.8rem" },
        h("tr", {}, h("th", {}, "Adresse"), h("th", {}, "Rôle"), h("th", {}, "État"), h("th", {}, "")),
        invitations.data.map((i) => h("tr", {}, h("td", {}, i.email), h("td", {}, i.role === "referent" ? "Référent" : "Professeur"),
          h("td", {}, i.acceptee_le ? `Rattaché le ${dateFr(i.acceptee_le)}` : "En attente"),
          h("td", {}, i.acceptee_le ? "" : h("button", { class: "btn discret", onclick: () => essai(async () => { verifier(await sb.from("invitations").delete().eq("id", i.id)); vueEtablissement(); }) }, "Annuler"))))) : null));
}

// ---------------------------------------------------------------------
//  Administration (administrateur de la plateforme)
// ---------------------------------------------------------------------
const QUALITES = {
  maximale: { nom: "Qualité maximale", detail: "Opus, réflexion approfondie" },
  standard: { nom: "Qualité standard", detail: "Opus, réflexion courte — environ 40 % moins cher" },
};
async function vueAdmin() {
  const etabs = verifier(await sb.from("etablissements").select("*").order("created_at"));
  const nom = h("input", { placeholder: "Nom de l’établissement" });
  const ref = h("input", { type: "email", placeholder: "Adresse du référent" });
  const zone = h("div");
  afficher(h("h2", {}, "Administration de la plateforme"),
    message("info", "Chaque établissement enregistre sa propre clé API. Votre clé ne sert qu’à votre établissement."),
    h("div", { class: "carte" }, h("table", { class: "liste" },
      h("tr", {}, h("th", {}, "Établissement"), h("th", {}, "Créé le"), h("th", {}, "Niveau de qualité"), h("th", {}, "Actif")),
      etabs.map((e) => {
        const z = h("span", { class: "doux" });
        const sel = h("select", { style: "width:auto", onchange: (ev) => essai(async () => {
          verifier(await sb.from("etablissements").update({ niveau_qualite: ev.target.value }).eq("id", e.id));
          z.textContent = " ✓ enregistré";
        }, z) }, Object.entries(QUALITES).map(([v, q]) => h("option", { value: v, selected: e.niveau_qualite === v }, `${q.nom} (${q.detail})`)));
        return h("tr", {}, h("td", {}, e.nom), h("td", {}, dateFr(e.created_at)), h("td", {}, sel, z), h("td", {}, e.actif ? "Oui" : "Non"));
      }))),
    h("p", { class: "doux" }, "Le niveau s’applique à toutes les adaptations des professeurs de l’établissement. Les référents le voient mais ne peuvent pas le modifier."),
    h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Ouvrir un établissement"),
      h("div", { class: "grille" }, h("div", {}, h("label", {}, "Nom"), nom), h("div", {}, h("label", {}, "Référent (e-mail)"), ref)),
      h("button", { class: "btn", style: "margin-top:.8rem", onclick: () => essai(async () => {
        verifier(await sb.rpc("creer_etablissement", { p_nom: nom.value.trim(), p_email_referent: ref.value.trim() }));
        zone.replaceChildren(message("ok", "Établissement créé. Le référent sera rattaché à sa première connexion ; il devra enregistrer sa propre clé API."));
        setTimeout(vueAdmin, 1200);
      }, zone) }, "Créer"), zone));
}

// ---------------------------------------------------------------------
sb.auth.onAuthStateChange((evt) => {
  if (evt === "PASSWORD_RECOVERY") {
    const mdp = prompt("Choisissez un nouveau mot de passe (8 caractères minimum) :");
    if (mdp) sb.auth.updateUser({ password: mdp }).then(({ error }) => alert(error ? error.message : "Mot de passe modifié."));
  }
});
demarrer();
