// =====================================================================
//  Adaptateur PAP — application professeur
//  JR Enseignement — v1
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  FONDS, POLICES, parametres, rendreHtml, cssRendu, pageHtmlAutonome, structureVersContenu,
  normaliser, docxDepuisContenu, tiersTemps, echapper, texteBloc,
} from "./rendu.js";

const SUPA_URL = "https://mfykdfytbnajxfnkjhwz.supabase.co";
const SUPA_CLE = "sb_publishable_B7kioKokXxrUihZ3FBofYQ_T49C21eO";
const sb = createClient(SUPA_URL, SUPA_CLE);

const NIVEAUX_CLASSE = [
  ["college_6_5", "Collège 6e-5e"], ["college_4_3", "Collège 4e-3e"], ["seconde", "Seconde"],
  ["premiere", "Première"], ["terminale", "Terminale"], ["bts", "BTS"], ["superieur_autre", "Autre post-bac"],
];
const NIVEAUX_ADAPT = { forme: "Forme seule", consignes: "Forme + consignes", fond: "Forme + fond", hors_document: "Hors document" };
const TYPES_TACHE = ["restitution", "identification", "calcul", "analyse", "justification", "redaction", "trace", "autre"];

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
  if (!r.ok) throw new Error(j.erreur ?? `Erreur du moteur (${r.status})`);
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
    sb.from("membres").select("role, etablissement_id, etablissements(id, nom)").eq("user_id", E.user.id),
    sb.from("referentiel_adaptations").select("*").eq("actif", true).order("ordre"),
    sb.from("prereglages").select("*").order("ordre"),
    sb.from("profils_niveau").select("*"),
  ]);
  E.admin = !!admin.data;
  E.etabs = (membres.data ?? []).map((m) => ({ id: m.etablissement_id, nom: m.etablissements?.nom, role: m.role }));
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
      h("button", { class: "btn", onclick: () => vueClasse(c) }, "Ouvrir")))) : h("p", { class: "vide" }, "Aucune classe pour l’instant."),
    h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Nouvelle classe"),
      h("div", { class: "grille" }, h("div", {}, h("label", {}, "Nom"), nom), h("div", {}, h("label", {}, "Niveau"), niveau), h("div", {}, h("label", {}, "Matière"), matiere)),
      h("button", { class: "btn", style: "margin-top:1rem", onclick: () => essai(async () => {
        if (!nom.value.trim() || !matiere.value.trim()) throw new Error("Indiquez le nom et la matière.");
        verifier(await sb.from("classes").insert({ etablissement_id: E.etab.id, professeur_id: E.user.id, nom: nom.value.trim(), niveau: niveau.value, matiere: matiere.value.trim() }));
        vueClasses();
      }, zone) }, "Créer la classe"), zone));
}

async function vueClasse(c) {
  afficher(chargement("Chargement…"));
  const eleves = verifier(await sb.from("eleves").select("*, profils_eleves(*)").eq("classe_id", c.id).order("identifiant"));
  const ident = h("input", { placeholder: "Ex. : TSTMG-A3", maxlength: 30 });
  const zone = h("div");
  afficher(
    h("button", { class: "btn discret", onclick: vueClasses }, "← Mes classes"),
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
                if (!confirm(`Supprimer l’élève ${e.identifiant} et son profil ?`)) return;
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
    const exemple = { titre: "Aperçu", duree_minutes: 55, sections: [{ id: "E1", titre: "Exercice 1", blocs: [
      { type: "consigne", texte: "Lisez le document 1 puis répondez aux questions." },
      { type: "document", titre: "Document 1", texte: "En 2025, l’entreprise a réalisé un chiffre d’affaires de 125000 euros.\nSes charges s’élèvent à 98000 euros.\nElle souhaite investir dans un nouveau local.\nLe dirigeant hésite entre l’achat et la location.\nUne étude de marché est en cours." },
      { type: "question", numero: "1", texte: "Calculez le résultat de l’entreprise.", points: 2 },
      { type: "zone_reponse", lignes: 2 }] }], bareme: [] };
    apercu.innerHTML = `<style>${cssRendu(p)}</style>${rendreHtml(exemple, p, { identifiant: eleve.identifiant })}`;
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
//  Documents : liste et parcours guidé
// ---------------------------------------------------------------------
const ETAPES = ["Déposer", "Vérifier la lecture", "Choisir les élèves", "Générer", "Propositions et ajustements", "Exporter"];
function bandeau(n) {
  return h("div", { class: "etapes" }, ETAPES.map((t, i) => h("span", { class: i < n ? "fait" : i === n ? "cour" : "" }, `${i + 1}. ${t}`)));
}

async function vueDocuments() {
  afficher(chargement("Chargement des documents…"));
  const docs = verifier(await sb.from("documents").select("id, titre, type, statut, created_at, classes(nom)").eq("etablissement_id", E.etab.id).order("created_at", { ascending: false }));
  const statuts = { depose: "Déposé", lu: "À vérifier", structure_validee: "Lecture validée", en_adaptation: "En adaptation", termine: "Terminé" };
  afficher(
    h("div", { class: "ligne", style: "justify-content:space-between" }, h("h2", {}, "Évaluations et cours"),
      h("button", { class: "btn", onclick: () => etapeDepot() }, "+ Nouveau document")),
    docs.length ? h("div", { class: "carte" }, h("table", { class: "liste" },
      h("tr", {}, h("th", {}, "Titre"), h("th", {}, "Type"), h("th", {}, "Classe"), h("th", {}, "État"), h("th", {}, "Créé le"), h("th", {}, "")),
      docs.map((d) => h("tr", {}, h("td", {}, h("b", {}, d.titre)), h("td", {}, d.type === "cours" ? "Cours" : "Évaluation"),
        h("td", {}, d.classes?.nom ?? "—"), h("td", {}, statuts[d.statut]), h("td", {}, dateFr(d.created_at)),
        h("td", {}, h("button", { class: "btn sec", onclick: () => reprendre(d.id) }, "Ouvrir")))))) :
      h("p", { class: "vide" }, "Aucun document. Commencez par déposer une évaluation ou un cours."));
}

async function chargerDoc(id) { return verifier(await sb.from("documents").select("*, classes(*)").eq("id", id).single()); }
async function reprendre(id) {
  const d = await chargerDoc(id);
  if (d.statut === "depose") return etapeLecture(d);
  if (d.statut === "lu") return etapeVerification(d);
  if (d.statut === "structure_validee") return etapeEleves(d);
  return etapePropositions(d);
}

// Étape 1 : dépôt
async function etapeDepot() {
  const classes = verifier(await sb.from("classes").select("*").eq("etablissement_id", E.etab.id).order("nom"));
  if (!classes.length) return afficher(bandeau(0), message("info", "Créez d’abord une classe et ses élèves."), h("button", { class: "btn", onclick: () => aller("classes") }, "Mes classes"));
  const type = h("select", {}, h("option", { value: "evaluation" }, "Évaluation"), h("option", { value: "cours" }, "Cours"));
  const titre = h("input", { placeholder: "Ex. : Évaluation chapitre 3 — la valeur ajoutée" });
  const classe = h("select", {}, classes.map((c) => h("option", { value: c.id }, c.nom)));
  const fichier = h("input", { type: "file", accept: ".pdf,.docx,.txt,.html,image/*" });
  const texte = h("textarea", { placeholder: "… ou collez ici le texte du document", style: "min-height:8rem" });
  const zone = h("div");
  afficher(bandeau(0), h("div", { class: "carte" },
    h("h2", {}, "Déposer un document"),
    h("div", { class: "grille" }, h("div", {}, h("label", {}, "Type"), type), h("div", {}, h("label", {}, "Classe"), classe)),
    h("label", {}, "Titre"), titre,
    h("label", {}, "Fichier : PDF, Word (.docx), photo ou scan"), fichier,
    h("p", { class: "doux" }, "PowerPoint : enregistrez-le d’abord en PDF. Une photo du tableau fonctionne aussi pour un cours."),
    texte,
    h("button", { class: "btn", style: "margin-top:1rem", onclick: () => essai(async () => {
      if (!titre.value.trim()) throw new Error("Donnez un titre au document.");
      const f = fichier.files[0];
      if (!f && !texte.value.trim()) throw new Error("Choisissez un fichier ou collez un texte.");
      zone.replaceChildren(chargement("Envoi du document…"));
      const doc = verifier(await sb.from("documents").insert({
        etablissement_id: E.etab.id, professeur_id: E.user.id, classe_id: classe.value, type: type.value, titre: titre.value.trim(),
      }).select().single());
      let blob, ext, ftype;
      if (!f) { blob = new Blob([texte.value], { type: "text/plain" }); ext = "txt"; ftype = "texte"; }
      else {
        const nom = f.name.toLowerCase();
        ext = nom.split(".").pop();
        if (ext === "docx") {
          await chargerScript("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js");
          const r = await window.mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
          blob = new Blob([r.value], { type: "text/html" }); ext = "html"; ftype = "texte";
        } else if (ext === "pdf") { blob = f; ftype = "pdf"; }
        else if (f.type.startsWith("image/")) { blob = f; ftype = ["png", "webp", "gif"].includes(ext) ? ext : "jpg"; }
        else if (["txt", "html"].includes(ext)) { blob = f; ftype = "texte"; }
        else throw new Error("Format non pris en charge. Utilisez PDF, Word, une image ou du texte.");
      }
      if (blob.size > 25 * 1024 * 1024) throw new Error("Fichier trop lourd (25 Mo maximum).");
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

// Étape 2a : lecture par le moteur
async function etapeLecture(d) {
  const zone = h("div", {}, chargement("Lecture du document par l’IA… (20 à 90 secondes)"));
  afficher(bandeau(1), h("div", { class: "carte" }, h("h2", {}, d.titre), zone));
  const r = await essai(() => appelMoteur({ action: "lire", document_id: d.id }), zone);
  if (r) etapeVerification(await chargerDoc(d.id));
  else zone.append(h("button", { class: "btn sec", onclick: () => etapeLecture(d) }, "Réessayer"));
}

// Étape 2b : vérification de la lecture
function etapeVerification(d) {
  const s = structuredClone(d.structure ?? {});
  const zone = h("div");
  if (d.type === "cours" || !s.exercices) return verificationCours(d, s);

  const total = h("b");
  const majTotal = () => { total.textContent = s.exercices.reduce((t, e) => t + (e.questions ?? []).reduce((u, q) => u + (Number(q.points) || 0), 0), 0); };
  const champ = (obj, cle, opts = {}) => {
    const el = h(opts.zone ? "textarea" : "input", { value: obj[cle] ?? "", type: opts.type, oninput: (e) => { obj[cle] = opts.type === "number" ? (e.target.value === "" ? null : +e.target.value) : e.target.value; if (opts.type === "number") majTotal(); } });
    if (opts.style) el.style.cssText = opts.style;
    return el;
  };
  const exos = s.exercices.map((ex) => h("div", { class: "carte" },
    h("div", { class: "ligne" }, h("b", {}, ex.id), champ(ex, "titre", { style: "flex:1;min-width:240px" })),
    h("label", {}, "Consigne générale"), champ(ex, "consigne_generale", { zone: true }),
    (ex.documents ?? []).map((doc) => h("div", {}, h("label", {}, `Document ${doc.id}${doc.titre ? " — " + doc.titre : ""}`), champ(doc, "contenu", { zone: true }))),
    (ex.questions ?? []).map((q) => h("div", { class: "q-edit" },
      h("div", { class: "ligne" }, h("b", {}, q.id), h("span", {}, "N°"), champ(q, "numero", { style: "width:4rem" }),
        h("span", {}, "Points"), champ(q, "points", { type: "number", style: "width:5rem" }),
        h("span", {}, "Tâche"), h("select", { style: "width:auto", onchange: (e) => { q.type_tache = e.target.value; } },
          TYPES_TACHE.map((t) => h("option", { value: t, selected: q.type_tache === t }, t)))),
      h("label", {}, "Énoncé"), champ(q, "enonce", { zone: true }),
      h("label", {}, "Compétence évaluée (l’outil garantit qu’elle reste évaluée)"), champ(q, "competence"))),
  ));
  majTotal();
  afficher(bandeau(1),
    h("h2", {}, `Vérifier la lecture — ${d.titre}`),
    message("info", "Relisez ce que l’outil a compris : énoncés, points et compétence de chaque question. Corrigez si besoin. Les adaptations s’appuieront sur cette version."),
    s.lisibilite && s.lisibilite !== "bonne" ? message("err", `Lisibilité du document : ${s.lisibilite}. Vérifiez attentivement le texte.`) : null,
    h("div", { class: "carte" }, h("div", { class: "grille" },
      h("div", {}, h("label", {}, "Titre"), champ(s, "titre")),
      h("div", {}, h("label", {}, "Durée (minutes)"), champ(s, "duree_minutes", { type: "number" })),
      h("div", {}, h("label", {}, "Barème total"), h("p", {}, total, " points")))),
    exos,
    h("div", { class: "ligne" }, h("button", { class: "btn", onclick: () => essai(async () => {
      const sansComp = s.exercices.flatMap((e) => e.questions ?? []).filter((q) => !String(q.competence ?? "").trim());
      if (sansComp.length) throw new Error(`Indiquez la compétence des questions : ${sansComp.map((q) => q.id).join(", ")}.`);
      verifier(await sb.from("documents").update({ structure: s, statut: "structure_validee" }).eq("id", d.id));
      etapeEleves(await chargerDoc(d.id));
    }, zone) }, "Valider la lecture"),
    h("button", { class: "btn sec", onclick: () => etapeLecture(d) }, "Relire le document")), zone);
}

function verificationCours(d, s) {
  s.parties = s.parties ?? [];
  const zone = h("div");
  afficher(bandeau(1), h("h2", {}, `Vérifier la lecture — ${d.titre}`),
    message("info", "Relisez le cours tel que l’outil l’a compris. Corrigez si besoin."),
    h("div", { class: "carte" }, h("label", {}, "Titre"), h("input", { value: s.titre ?? "", oninput: (e) => { s.titre = e.target.value; } })),
    s.parties.map((p) => h("div", { class: "carte" },
      h("input", { value: p.titre ?? "", oninput: (e) => { p.titre = e.target.value; }, style: "font-weight:600" }),
      (p.blocs ?? []).map((b) => h("div", { class: "q-edit" }, h("span", { class: "pastille" }, b.type ?? "bloc"),
        h("textarea", { value: texteBloc(b), oninput: (e) => { b.texte = e.target.value; delete b.contenu; } }))))),
    h("button", { class: "btn", onclick: () => essai(async () => {
      verifier(await sb.from("documents").update({ structure: s, statut: "structure_validee" }).eq("id", d.id));
      etapeEleves(await chargerDoc(d.id));
    }, zone) }, "Valider la lecture"), zone);
}

// Étape 3 : élèves concernés
async function etapeEleves(d) {
  afficher(chargement("Chargement des élèves…"));
  const eleves = verifier(await sb.from("eleves").select("*, profils_eleves(*)").eq("classe_id", d.classe_id).order("identifiant"));
  const deja = verifier(await sb.from("document_eleves").select("*").eq("document_id", d.id));
  const choix = new Map(deja.map((x) => [x.eleve_id, x.niveau_max]));
  const zone = h("div");
  if (!eleves.length) return afficher(bandeau(2), message("info", "Cette classe n’a pas encore d’élève avec un profil PAP."), h("button", { class: "btn", onclick: () => vueClasse(d.classes) }, "Ajouter des élèves"));
  afficher(bandeau(2), h("h2", {}, `Élèves concernés — ${d.titre}`),
    h("div", { class: "carte" }, h("table", { class: "liste" },
      h("tr", {}, h("th", {}, ""), h("th", {}, "Élève"), h("th", {}, "Adaptations"), h("th", {}, "Niveau maximal pour ce document")),
      eleves.map((e) => {
        const p = e.profils_eleves ?? {};
        const sel = h("select", { onchange: (ev) => { if (choix.has(e.id)) choix.set(e.id, ev.target.value); } },
          ["forme", "consignes", "fond"].map((v) => h("option", { value: v, selected: (choix.get(e.id) ?? p.niveau_max ?? "fond") === v }, NIVEAUX_ADAPT[v])));
        return h("tr", {},
          h("td", {}, h("input", { type: "checkbox", checked: choix.has(e.id), onchange: (ev) => { ev.target.checked ? choix.set(e.id, sel.value) : choix.delete(e.id); } })),
          h("td", {}, h("b", {}, e.identifiant)),
          h("td", { class: "doux" }, (p.codes ?? []).join(" ") || "aucune — profil à remplir"),
          h("td", {}, sel));
      }))),
    h("button", { class: "btn", onclick: () => essai(async () => {
      if (!choix.size) throw new Error("Cochez au moins un élève.");
      verifier(await sb.from("document_eleves").delete().eq("document_id", d.id));
      verifier(await sb.from("document_eleves").insert([...choix].map(([eleve_id, niveau_max]) => ({ document_id: d.id, eleve_id, niveau_max }))));
      etapeGeneration(d, eleves.filter((e) => choix.has(e.id)));
    }, zone) }, "Générer les propositions"), zone);
}

// Étape 4 : génération
async function etapeGeneration(d, eleves) {
  const lignes = new Map(eleves.map((e) => [e.id, h("li", {}, `${e.identifiant} — en attente`)]));
  afficher(bandeau(3), h("h2", {}, "Génération des propositions"),
    message("info", "Une proposition est produite par niveau autorisé. Les élèves au profil identique partagent la même génération."),
    h("div", { class: "carte" }, h("ul", {}, [...lignes.values()])));
  for (const e of eleves) {
    const li = lignes.get(e.id);
    li.replaceChildren(h("span", { class: "chargement" }), ` ${e.identifiant} — adaptation en cours…`);
    try {
      const r = await appelMoteur({ action: "adapter", document_id: d.id, eleve_id: e.id });
      li.replaceChildren(`✓ ${e.identifiant} — ${r.propositions.length} proposition(s)`);
    } catch (err) { li.replaceChildren(h("span", { style: "color:var(--erreur)" }, `✗ ${e.identifiant} — ${err.message}`)); }
  }
  etapePropositions(await chargerDoc(d.id));
}

// Étape 5 : propositions, aperçu, ajustements
async function etapePropositions(d, eleveActif) {
  afficher(chargement("Chargement des propositions…"));
  const liens = verifier(await sb.from("document_eleves").select("niveau_max, eleves(*, profils_eleves(*))").eq("document_id", d.id));
  const eleves = liens.map((l) => l.eleves).filter(Boolean).sort((a, b) => a.identifiant.localeCompare(b.identifiant));
  if (!eleves.length) return etapeEleves(d);
  const actif = eleves.find((e) => e.id === eleveActif) ?? eleves[0];
  const versions = verifier(await sb.from("versions").select("*").eq("document_id", d.id).eq("eleve_id", actif.id).order("created_at"));
  const profil = actif.profils_eleves ?? {};
  const niveauClasse = E.profilsNiveau[d.classes?.niveau];

  const props = versions.filter((v) => !v.parent_id);
  let courante = versions.find((v) => v.choisie) ?? versions[versions.length - 1];
  const feuille = h("div", { class: "feuille" });
  const panneau = h("div");

  // La mise en forme du profil s'applique à toutes les propositions, y compris « Forme seule ».
  const params = () => parametres(profil.codes ?? [], profil.preferences ?? {}, niveauClasse);
  const montrer = (v) => {
    courante = v;
    const p = params(v);
    feuille.innerHTML = `<style>${cssRendu(p)}</style>${rendreHtml(v.contenu, p, { identifiant: actif.identifiant })}`;
    panneauDroit();
  };

  const carteControle = (v) => {
    const c = v.controle ?? {};
    return h("div", { class: "controle" },
      (c.verifications ?? []).map((x) => h("div", { class: x.ok ? "ok" : "ko" }, `${x.ok ? "✓" : "⚠"} ${x.controle} — ${x.detail}`)),
      (c.application ?? []).length ? h("details", {}, h("summary", {}, "Application case par case"),
        (c.application ?? []).map((a) => h("div", { class: a.applique ? "ok" : "ko" }, `${a.applique ? "✓" : "⚠"} ${a.code}${a.detail ? " — " + a.detail : ""}`))) : null,
      (c.alertes ?? []).map((a) => h("div", { class: "ko" }, `⚠ ${a}`)));
  };

  function panneauDroit() {
    const msg = h("textarea", { placeholder: "Ex. : la question 3 est encore trop longue ; remets le schéma de l’exercice 2…" });
    const retenir = h("input", { type: "checkbox" });
    const zone = h("div");
    const historique = versions.filter((v) => v.document_id === d.id);
    panneau.replaceChildren(
      h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Propositions"),
        props.length ? props.map((v) => h("div", { class: `prop ${v.choisie ? "choisie" : ""}`, style: "margin-bottom:.6rem" },
          h("div", { class: "ligne", style: "justify-content:space-between" },
            h("span", { class: `pastille ${v.niveau}` }, NIVEAUX_ADAPT[v.niveau]),
            h("span", {}, h("button", { class: "btn discret", onclick: () => montrer(v) }, "Voir"),
              h("button", { class: "btn sec", onclick: () => choisir(v) }, v.choisie ? "Choisie ✓" : "Choisir"))),
          h("ul", { class: "doux" }, (v.resume_modifications ?? []).slice(0, 6).map((r) => h("li", {}, r))),
          carteControle(v))) : h("p", { class: "doux" }, "Aucune proposition. Relancez la génération.")),
      courante ? h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Ajuster la version affichée"),
        h("p", { class: "doux" }, `Version du ${dateFr(courante.created_at)} — ${NIVEAUX_ADAPT[courante.niveau]}${courante.auteur === "professeur" ? " — modifiée à la main" : ""}`),
        msg, h("label", { class: "ligne", style: "font-weight:normal" }, retenir, "Retenir cette préférence pour mes prochaines adaptations"),
        h("div", { class: "ligne", style: "margin-top:.5rem" },
          h("button", { class: "btn", onclick: () => essai(async () => {
            if (!msg.value.trim()) throw new Error("Écrivez l’ajustement souhaité.");
            zone.replaceChildren(chargement("Ajustement en cours…"));
            if (retenir.checked) await memoriser(msg.value.trim());
            const r = await appelMoteur({ action: "ajuster", version_id: courante.id, message: msg.value.trim() });
            await sb.from("versions").update({ choisie: false }).eq("document_id", d.id).eq("eleve_id", actif.id);
            await sb.from("versions").update({ choisie: true }).eq("id", r.version.id);
            etapePropositions(d, actif.id);
          }, zone) }, "Demander l’ajustement"),
          h("button", { class: "btn sec", onclick: () => modeEdition() }, "Modifier à la main")),
        zone) : null,
      h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Historique"),
        historique.slice().reverse().map((v) => h("div", { class: "ligne", style: "justify-content:space-between;border-top:1px solid #EEF1F4;padding:.3rem 0" },
          h("span", { class: "doux" }, `${dateFr(v.created_at)} · ${NIVEAUX_ADAPT[v.niveau]}${v.auteur === "professeur" ? " · à la main" : v.parent_id ? " · ajustée" : ""}${v.choisie ? " · choisie" : ""}`),
          h("span", {}, h("button", { class: "btn discret", onclick: () => montrer(v) }, "Voir"), h("button", { class: "btn discret", onclick: () => choisir(v) }, "Revenir"))))),
      h("button", { class: "btn", onclick: () => etapeExport(d) }, "Passer à l’export →"));
  }

  async function choisir(v) {
    await essai(async () => {
      verifier(await sb.from("versions").update({ choisie: false }).eq("document_id", d.id).eq("eleve_id", actif.id));
      verifier(await sb.from("versions").update({ choisie: true }).eq("id", v.id));
      etapePropositions(d, actif.id);
    });
  }

  function modeEdition() {
    const c = structuredClone(normaliser(courante.contenu));
    const p = params(courante);
    const conteneur = h("div", { class: "rendu edition", style: `font-family:${p.police};font-size:${p.taille}pt;line-height:${p.interligne};background:${p.fond};padding:1rem` });
    conteneur.append(h("div", { contenteditable: "true", "data-edit": "1", style: "font-size:1.3em;font-weight:bold", oninput: (e) => { c.titre = e.target.innerText; } }, c.titre));
    c.sections.forEach((s) => {
      conteneur.append(h("h2", { contenteditable: "true", "data-edit": "1", oninput: (e) => { s.titre = e.target.innerText; } }, s.titre ?? ""));
      (s.blocs ?? []).forEach((b) => {
        if (b.type === "zone_reponse" || b.type === "saut_page") return conteneur.append(h("div", { class: "doux" }, `[${b.type === "zone_reponse" ? `zone de réponse, ${b.lignes ?? 4} lignes` : "saut de page"}]`));
        const cle = b.texte != null ? "texte" : b.contenu != null ? "contenu" : b.enonce != null ? "enonce" : "texte";
        conteneur.append(h("div", { class: "bloc" }, h("span", { class: "pastille" }, b.type),
          h("div", { contenteditable: "true", "data-edit": "1", style: "white-space:pre-wrap", oninput: (e) => { b[cle] = e.target.innerText; } }, texteBloc(b))));
        for (const liste of ["propositions", "items", "debuts"]) {
          if (Array.isArray(b[liste])) b[liste].forEach((it, k) => conteneur.append(h("div", { contenteditable: "true", "data-edit": "1", style: "margin-left:1.5em", oninput: (e) => { b[liste][k] = e.target.innerText; } }, typeof it === "string" ? it : it.texte ?? "")));
        }
      });
    });
    const zone = h("div");
    feuille.replaceChildren(conteneur);
    panneau.replaceChildren(h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Modification à la main"),
      h("p", { class: "doux" }, "Cliquez dans le texte pour le modifier. La mise en forme du profil sera réappliquée à l’export."),
      h("div", { class: "ligne" },
        h("button", { class: "btn", onclick: () => essai(async () => {
          verifier(await sb.from("versions").update({ choisie: false }).eq("document_id", d.id).eq("eleve_id", actif.id));
          verifier(await sb.from("versions").insert({ document_id: d.id, eleve_id: actif.id, numero_proposition: courante.numero_proposition, niveau: courante.niveau, contenu: c, resume_modifications: ["Modifiée à la main par le professeur"], controle: courante.controle, parent_id: courante.id, auteur: "professeur", choisie: true }));
          etapePropositions(d, actif.id);
        }, zone) }, "Enregistrer mes modifications"),
        h("button", { class: "btn sec", onclick: () => montrer(courante) }, "Annuler")), zone));
  }

  afficher(bandeau(4), h("h2", {}, `Propositions — ${d.titre}`),
    h("div", { class: "onglets" }, eleves.map((e) => h("button", { class: e.id === actif.id ? "actif" : "", onclick: () => etapePropositions(d, e.id) }, e.identifiant)),
      h("button", { onclick: () => etapeEleves(d) }, "+ élèves")),
    versions.length ? h("div", { class: "deux" }, panneau, feuille) : h("div", {}, message("info", "Aucune proposition pour cet élève."),
      h("button", { class: "btn", onclick: () => etapeGeneration(d, [actif]) }, "Générer maintenant")));
  if (courante) montrer(courante); else panneauDroit();
}

async function memoriser(texte) {
  const { data } = await sb.from("memoire_professeur").select("consignes").eq("professeur_id", E.user.id).maybeSingle();
  const liste = [...new Set([...(data?.consignes ?? []), texte])].slice(-30);
  await sb.from("memoire_professeur").upsert({ professeur_id: E.user.id, consignes: liste });
}

// Étape 6 : export
async function etapeExport(d) {
  afficher(chargement("Préparation des exports…"));
  const liens = verifier(await sb.from("document_eleves").select("eleves(*, profils_eleves(*))").eq("document_id", d.id));
  const eleves = liens.map((l) => l.eleves).filter(Boolean).sort((a, b) => a.identifiant.localeCompare(b.identifiant));
  const versions = verifier(await sb.from("versions").select("*").eq("document_id", d.id).order("created_at"));
  const niveauClasse = E.profilsNiveau[d.classes?.niveau];
  const versionClasse = structureVersContenu(d.structure);
  const pClasse = parametres([], {}, niveauClasse);

  const versionDe = (e) => versions.filter((v) => v.eleve_id === e.id).find((v) => v.choisie) ?? versions.filter((v) => v.eleve_id === e.id).at(-1);
  const paramsDe = (e) => parametres(e.profils_eleves?.codes ?? [], e.profils_eleves?.preferences ?? {}, niveauClasse);

  const boutons = (contenu, p, identifiant, base) => h("span", { class: "ligne" },
    h("button", { class: "btn sec", onclick: () => exporterWord(contenu, p, identifiant, base) }, "Word"),
    h("button", { class: "btn sec", onclick: () => imprimer(contenu, p, identifiant) }, "PDF"),
    h("button", { class: "btn sec", onclick: () => telecharger(`${base}.html`, pageHtmlAutonome(contenu, p, { identifiant }), "text/html") }, "HTML"));

  afficher(bandeau(5), h("h2", {}, `Exporter — ${d.titre}`),
    message("info", "PDF : choisissez « Enregistrer au format PDF » dans la fenêtre d’impression. HTML : version interactive (lecture vocale, règle de lecture, pas à pas selon le profil)."),
    h("div", { class: "carte" }, h("table", { class: "liste" },
      h("tr", {}, h("th", {}, "Version"), h("th", {}, "Niveau"), h("th", {}, "Exports")),
      h("tr", {}, h("td", {}, h("b", {}, "Version classe")), h("td", {}, "Originale"), h("td", {}, boutons(versionClasse, pClasse, "", nomFichier(d.titre) + "_classe"))),
      eleves.map((e) => {
        const v = versionDe(e);
        return h("tr", {}, h("td", {}, h("b", {}, e.identifiant)), h("td", {}, v ? NIVEAUX_ADAPT[v.niveau] : "—"),
          h("td", {}, v ? boutons(v.contenu, paramsDe(e), e.identifiant, `${nomFichier(d.titre)}_${nomFichier(e.identifiant)}`) : "Aucune version"));
      }))),
    h("div", { class: "carte" }, h("h3", { style: "margin-top:0" }, "Page de garde professeur"),
      h("p", { class: "doux" }, "Aménagements hors document (temps majoré, lecture des consignes, placement…) pour chaque élève. À ne pas distribuer."),
      h("button", { class: "btn", onclick: () => pageDeGarde(d, eleves, versionDe) }, "Imprimer la page de garde")),
    h("div", { class: "ligne" },
      h("button", { class: "btn discret", onclick: () => etapePropositions(d) }, "← Propositions"),
      h("button", { class: "btn sec", onclick: () => essai(async () => { verifier(await sb.from("documents").update({ statut: "termine" }).eq("id", d.id)); vueDocuments(); }) }, "Marquer comme terminé")));
}

async function exporterWord(contenu, p, identifiant, base) {
  await essai(async () => {
    const docx = await import("https://esm.sh/docx@9.5.1");
    const doc = docxDepuisContenu(docx, contenu, p, { identifiant });
    telecharger(`${base}.docx`, await docx.Packer.toBlob(doc));
  });
}

function imprimer(contenu, p, identifiant) {
  const w = window.open("", "_blank");
  if (!w) return alert("Autorisez les fenêtres pour cette page afin d’imprimer.");
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(normaliser(contenu).titre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;600&display=swap" rel="stylesheet">
<link href="https://fonts.cdnfonts.com/css/opendyslexic" rel="stylesheet">
<style>body{margin:0}${cssRendu(p)}</style></head><body>${rendreHtml(contenu, p, { identifiant })}
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))<\/script></body></html>`);
  w.document.close();
}

function pageDeGarde(d, eleves, versionDe) {
  const duree = d.structure?.duree_minutes;
  const blocs = eleves.map((e) => {
    const v = versionDe(e);
    const hd = v?.controle?.hors_document ?? [];
    const codes = new Set(e.profils_eleves?.codes ?? []);
    const lignes = hd.map((a) => `<li><b>${echapper(a.code)} · ${echapper(a.libelle)}</b>${a.code === "H1" && duree ? ` — <b>${echapper(tiersTemps(duree))}</b> au lieu de ${echapper(duree)} min` : ""}<br><span style="color:#555">${echapper(a.regles)}</span></li>`).join("");
    return `<div style="border:1px solid #bbb;border-radius:8px;padding:.6em 1em;margin:.8em 0;break-inside:avoid">
<h3 style="margin:.2em 0">${echapper(e.identifiant)} <span style="font-weight:normal;color:#666">— ${v ? echapper(NIVEAUX_ADAPT[v.niveau]) : "pas de version"}</span></h3>
<p style="margin:.3em 0;color:#555">Adaptations du profil : ${echapper([...codes].join(" ") || "aucune")}</p>
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
  const modele = h("select", {}, [["claude-sonnet-5-5", "Claude Sonnet 5.5 (recommandé)"], ["claude-opus-5-5", "Claude Opus 5.5 (plus précis, plus cher)"], ["claude-haiku-5-5", "Claude Haiku 5.5 (économique)"]]
    .map(([v, t]) => h("option", { value: v, selected: (etab.data?.modele_ia ?? "claude-sonnet-5-5") === v }, t)));
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
        h("label", {}, "Modèle d’IA"), modele,
        h("button", { class: "btn", style: "margin-top:.6rem", onclick: () => essai(async () => {
          verifier(await sb.from("etablissements").update({ plafond_mensuel_eur: +plafond.value, modele_ia: modele.value }).eq("id", E.etab.id));
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
async function vueAdmin() {
  const etabs = verifier(await sb.from("etablissements").select("*").order("created_at"));
  const nom = h("input", { placeholder: "Nom de l’établissement" });
  const ref = h("input", { type: "email", placeholder: "Adresse du référent" });
  const zone = h("div");
  afficher(h("h2", {}, "Administration de la plateforme"),
    message("info", "Chaque établissement enregistre sa propre clé API. Votre clé ne sert qu’à votre établissement."),
    h("div", { class: "carte" }, h("table", { class: "liste" },
      h("tr", {}, h("th", {}, "Établissement"), h("th", {}, "Créé le"), h("th", {}, "Actif")),
      etabs.map((e) => h("tr", {}, h("td", {}, e.nom), h("td", {}, dateFr(e.created_at)), h("td", {}, e.actif ? "Oui" : "Non"))))),
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
