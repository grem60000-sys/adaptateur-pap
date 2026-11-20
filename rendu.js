// =====================================================================
//  Adaptateur PAP — moteur de rendu v2 (HTML, impression, Word)
//  Cartes par exercice, figures redessinées en SVG, réponses intégrées.
// =====================================================================

export const FONDS = {
  blanc: "#FFFFFF", creme: "#FDF6E3", bleu: "#E8F1FA", vert: "#EAF5EA", jaune: "#FFF9DB", rose: "#FCEEF2",
};
export const POLICES = {
  Arial: "Arial, Helvetica, sans-serif",
  Verdana: "Verdana, Geneva, sans-serif",
  OpenDyslexic: "'OpenDyslexic', Arial, sans-serif",
  "Atkinson Hyperlegible": "'Atkinson Hyperlegible', Arial, sans-serif",
  Lexend: "'Lexend', Arial, sans-serif",
};
const BLEU = "#1F4E8C";

export const echapper = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function texteBloc(b) {
  return b.texte ?? b.contenu ?? b.enonce ?? b.consigne ?? b.question ?? b.text ?? b.description ?? "";
}

/** Nombres lisibles (J1) : espace fine entre les milliers, sans toucher aux années. */
export function nombresLisibles(t) {
  return String(t).replace(/\b\d{4,}(?:[.,]\d+)?\b/g, (n) => {
    const [ent, dec] = n.split(/([.,].*)/);
    if (ent.length === 4 && +ent >= 1900 && +ent <= 2100 && !dec) return n;
    return ent.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (dec ?? "");
  });
}

/** Nombre au format français : virgule décimale, vrai signe moins. */
export function nombreFr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  const s = String(Math.round(n * 1000) / 1000).replace(".", ",");
  return n < 0 ? "−" + s.slice(1) : s;
}

const FIGURES = new Set(["droite_graduee", "repere"]);

// ---------------------------------------------------------------------
//  Conversion structure → contenu (version classe)
// ---------------------------------------------------------------------
const TACHES_LONGUES = new Set(["analyse", "justification", "redaction"]);
export function structureVersContenu(s) {
  if (!s) return { titre: "", sections: [], bareme: [] };
  if (!s.exercices && s.parties) return coursVersContenu(s);
  const sections = (s.exercices ?? []).map((ex) => {
    const blocs = [];
    if (ex.consigne_generale) blocs.push({ type: "consigne", texte: ex.consigne_generale });
    for (const d of ex.documents ?? []) blocs.push({ type: "document", id: d.id, titre: d.titre, texte: d.contenu });
    for (const f of ex.figures ?? []) blocs.push(f.type === "autre" ? { type: "document", titre: f.titre, texte: f.description } : { ...f });
    for (const q of ex.questions ?? []) {
      blocs.push({ type: "question", id: q.id, numero: q.numero, texte: q.enonce, points: q.points });
      blocs.push({ type: "zone_reponse", lignes: TACHES_LONGUES.has(q.type_tache) ? 4 : 2 });
    }
    const total = (ex.questions ?? []).reduce((t, q) => t + (Number(q.points) || 0), 0);
    return { id: ex.id, titre: ex.titre, points: total ? nombreFr(total) : undefined, blocs };
  });
  const bareme = (s.exercices ?? []).flatMap((ex) =>
    (ex.questions ?? []).map((q) => ({ question_id: q.id, points: q.points ?? 0, competence: q.competence })));
  return { titre: s.titre, duree_minutes: s.duree_minutes, sections, bareme };
}
export function coursVersContenu(s) {
  const sections = (s.parties ?? []).map((p, i) => ({
    id: p.id ?? `P${i + 1}`, titre: p.titre,
    blocs: (p.blocs ?? []).map((b) => ({ ...b, type: b.type ?? "explication", texte: texteBloc(b) })),
  }));
  return { titre: s.titre, sections, bareme: [] };
}
export function normaliser(contenu) {
  if (!contenu) return { titre: "", sections: [], bareme: [] };
  if ((!contenu.sections || contenu.sections.length === 0) && contenu.parties) return coursVersContenu(contenu);
  return { ...contenu, sections: contenu.sections ?? [], bareme: contenu.bareme ?? [] };
}

// ---------------------------------------------------------------------
//  Paramètres de mise en forme selon le profil
// ---------------------------------------------------------------------
export function parametres(codes = [], prefs = {}, niveauClasse = null) {
  const a = new Set(codes);
  const tailleMin = niveauClasse?.taille_police_min ?? 14;
  return {
    codes: a,
    adapte: codes.length > 0,
    police: a.has("A1") ? (POLICES[prefs.police] ?? POLICES.Arial) : POLICES.Arial,
    taille: a.has("A2") ? Math.max(Number(prefs.taille ?? 14), tailleMin) : 11,
    interligne: a.has("A3") ? Math.max(Number(prefs.interligne ?? 1.5), 1.5) : 1.25,
    fond: a.has("A10") ? (FONDS[prefs.fond] ?? FONDS.creme) : "#FFFFFF",
    couleurTexte: a.has("A10") ? "#2B2B2B" : "#111111",
    aere: a.has("A4"),
    saut: a.has("A5"),
    reperes: a.has("A6"),
    tableaux: a.has("A9") || a.has("K6"),
    lignesNum: a.has("C1"),
    paragraphesNum: a.has("C2"),
    nombres: a.has("J1"),
    grandesZones: a.has("K2"),
    progression: a.has("I1"),
    pictos: a.has("L2"),
    audio: a.has("C6") || a.has("L3") || a.has("CO10"),
    regle: a.has("A11"),
    pasAPas: a.has("I2"),
    plan: a.has("CO1"),
    minuteur: a.has("I5"),
  };
}

const PICTOS = [
  [/\b(lis|lisez|lire|observe|observez)\b/i, "📖"],
  [/\b(calcul|calcule|calculez|calculer)\b/i, "🧮"],
  [/\b(entour|coch|soulign|reli|barre)/i, "⭕"],
  [/\b(écri|ecri|rédige|rédigez|justifie|justifiez|explique|expliquez|complète|complétez|range|place)/i, "✏️"],
];
function picto(t) { for (const [re, p] of PICTOS) if (re.test(t)) return p; return ""; }

function txt(t, p) {
  const s = p.nombres ? nombresLisibles(t ?? "") : String(t ?? "");
  return echapper(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

// ---------------------------------------------------------------------
//  Figures SVG
// ---------------------------------------------------------------------
export function svgDroite(b, opts = {}) {
  const min = Number(b.min ?? 0), max = Number(b.max ?? 10);
  const pas = Number(b.pas) > 0 ? Number(b.pas) : 1;
  const W = opts.largeur ?? 640, H = 78, m = 28, y = 40;
  const X = (v) => m + ((v - min) / (max - min || 1)) * (W - 2 * m);
  const n = Math.round((max - min) / pas);
  const etiq = Array.isArray(b.etiquettes) && b.etiquettes.length ? b.etiquettes.map(Number)
    : (n <= 14 ? Array.from({ length: n + 1 }, (_, i) => min + i * pas) : []);
  const proche = (v, liste) => liste.some((e) => Math.abs(e - v) < pas / 1000);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial" font-size="13">`;
  const debut = b.demi_droite ? X(min) : 8;
  s += `<line x1="${debut}" y1="${y}" x2="${W - 8}" y2="${y}" stroke="#222" stroke-width="1.6"/>`;
  s += `<polygon points="${W - 4},${y} ${W - 14},${y - 5} ${W - 14},${y + 5}" fill="#222"/>`;
  for (let i = 0; i <= n; i++) {
    const v = min + i * pas, x = X(v);
    s += `<line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke="#222" stroke-width="1.2"/>`;
    if (proche(v, etiq)) s += `<text x="${x}" y="${y + 24}" text-anchor="middle">${nombreFr(v)}</text>`;
  }
  for (const pt of b.points ?? []) {
    const x = X(Number(pt.valeur));
    s += `<g stroke="${BLEU}" stroke-width="2.2"><line x1="${x - 5}" y1="${y - 5}" x2="${x + 5}" y2="${y + 5}"/><line x1="${x - 5}" y1="${y + 5}" x2="${x + 5}" y2="${y - 5}"/></g>`;
    s += `<text x="${x}" y="${y - 12}" text-anchor="middle" font-weight="bold" fill="${BLEU}" font-size="14">${echapper(pt.nom)}</text>`;
  }
  return s + "</svg>";
}

export function svgRepere(b) {
  const xmin = Math.floor(Number(b.xmin ?? -5)), xmax = Math.ceil(Number(b.xmax ?? 5));
  const ymin = Math.floor(Number(b.ymin ?? -5)), ymax = Math.ceil(Number(b.ymax ?? 5));
  const pas = Number(b.pas) > 0 ? Number(b.pas) : 1;
  const unites = Math.max((xmax - xmin) / pas, (ymax - ymin) / pas);
  const c = Math.max(26, Math.min(34, Math.round(260 / unites))), m = 22;
  const W = (xmax - xmin) / pas * c + 2 * m, H = (ymax - ymin) / pas * c + 2 * m;
  const X = (v) => m + (v - xmin) / pas * c, Y = (v) => m + (ymax - v) / pas * c;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial" font-size="11">`;
  for (let v = xmin; v <= xmax + 1e-9; v += pas) s += `<line x1="${X(v)}" y1="${Y(ymax)}" x2="${X(v)}" y2="${Y(ymin)}" stroke="#ccc" stroke-width="0.8"/>`;
  for (let v = ymin; v <= ymax + 1e-9; v += pas) s += `<line x1="${X(xmin)}" y1="${Y(v)}" x2="${X(xmax)}" y2="${Y(v)}" stroke="#ccc" stroke-width="0.8"/>`;
  const x0 = X(Math.min(Math.max(0, xmin), xmax)), y0 = Y(Math.min(Math.max(0, ymin), ymax));
  s += `<line x1="${X(xmin) - 6}" y1="${y0}" x2="${X(xmax) + 10}" y2="${y0}" stroke="#222" stroke-width="1.5"/>`;
  s += `<polygon points="${X(xmax) + 14},${y0} ${X(xmax) + 5},${y0 - 4} ${X(xmax) + 5},${y0 + 4}" fill="#222"/>`;
  s += `<line x1="${x0}" y1="${Y(ymin) + 6}" x2="${x0}" y2="${Y(ymax) - 10}" stroke="#222" stroke-width="1.5"/>`;
  s += `<polygon points="${x0},${Y(ymax) - 14} ${x0 - 4},${Y(ymax) - 5} ${x0 + 4},${Y(ymax) - 5}" fill="#222"/>`;
  for (let v = xmin; v <= xmax + 1e-9; v += pas) if (Math.abs(v) > 1e-9) s += `<text x="${X(v)}" y="${y0 + 13}" text-anchor="middle">${nombreFr(v)}</text>`;
  for (let v = ymin; v <= ymax + 1e-9; v += pas) if (Math.abs(v) > 1e-9) s += `<text x="${x0 - 5}" y="${Y(v) + 4}" text-anchor="end">${nombreFr(v)}</text>`;
  s += `<text x="${x0 - 5}" y="${y0 + 13}" text-anchor="end">0</text>`;
  const pts = Object.fromEntries((b.points ?? []).map((pt) => [pt.nom, pt]));
  for (const [a, z] of b.segments ?? []) if (pts[a] && pts[z]) s += `<line x1="${X(+pts[a].x)}" y1="${Y(+pts[a].y)}" x2="${X(+pts[z].x)}" y2="${Y(+pts[z].y)}" stroke="${BLEU}" stroke-width="1.4"/>`;
  for (const pt of b.points ?? []) {
    const x = X(Number(pt.x)), y = Y(Number(pt.y));
    s += `<g stroke="${BLEU}" stroke-width="2"><line x1="${x - 4}" y1="${y - 4}" x2="${x + 4}" y2="${y + 4}"/><line x1="${x - 4}" y1="${y + 4}" x2="${x + 4}" y2="${y - 4}"/></g>`;
    s += `<text x="${x + 6}" y="${y - 6}" font-weight="bold" fill="${BLEU}" font-size="13">${echapper(pt.nom)}</text>`;
  }
  return s + "</svg>";
}

export function svgFigure(b) {
  return b.type === "repere" ? svgRepere(b) : svgDroite(b);
}

// ---------------------------------------------------------------------
//  Blocs HTML
// ---------------------------------------------------------------------
function tableauHtml(b, p) {
  let lignes = b.lignes ?? [];
  const entete = b.colonnes ? [b.colonnes] : [];
  const rows = [...entete, ...lignes];
  if (!rows.length) return "";
  const cell = (c, th) => {
    const v = c == null ? "" : String(c);
    const vide = v.trim() === "";
    const tag = th ? "th" : "td";
    return `<${tag} class="${vide ? "vide" : ""}${v.trim() === "☐" ? " case-c" : ""}">${vide ? "" : txt(v, p)}</${tag}>`;
  };
  const html = rows.map((l, i) => {
    const cells = Array.isArray(l) ? l : Object.values(l);
    return `<tr>${cells.map((c, j) => cell(c, i < entete.length || (j === 0 && b.entete_ligne !== false && entete.length))).join("")}</tr>`;
  }).join("");
  return `<div class="bloc"><table class="tab ${p.tableaux ? "zebre" : ""}">${html}</table></div>`;
}

export function blocHtml(b, p) {
  const type = b.type ?? "autre";
  const t = texteBloc(b);
  const pic = (x) => (p.pictos ? `<span class="picto">${picto(x)}</span>` : "");
  switch (type) {
    case "lexique":
      return `<div class="bloc encadre lexique"><div class="encadre-titre">Mon lexique</div><ul>${(b.items ?? []).map((i) =>
        `<li><b>${txt(i.terme ?? i.mot ?? "", p)}</b> : ${txt(i.definition ?? i.texte ?? "", p)}</li>`).join("")}</ul></div>`;
    case "encadre": case "a_retenir": case "definition": case "rappel": {
      const titre = b.titre ?? (type === "a_retenir" ? "À retenir" : type === "definition" ? "Définition" : type === "rappel" ? "Rappel" : "");
      const corps = Array.isArray(b.items) ? `<ul>${b.items.map((i) => `<li>${txt(i, p)}</li>`).join("")}</ul>` : `<div>${txt(t, p)}</div>`;
      return `<div class="bloc encadre ${type}">${titre ? `<div class="encadre-titre">${txt(titre, p)}</div>` : ""}${corps}</div>`;
    }
    case "consigne": case "etape": {
      const pre = type === "etape" && b.numero ? `<b>${echapper(b.numero)})</b> ` : "";
      return `<div class="bloc consigne ${type === "etape" ? "etape" : ""} ${p.reperes ? "repere-consigne" : ""}">${pic(t)}${pre}${txt(t, p)}</div>`;
    }
    case "donnees":
      return `<div class="bloc donnees">${b.intro ? `<span>${txt(b.intro, p)}</span>` : ""}${(b.valeurs ?? []).map((v) => `<b>${txt(v, p)}</b>`).join("")}</div>`;
    case "tableau": return tableauHtml(b, p);
    case "choix":
      return `<div class="bloc">${txt(b.avant ?? t, p)} <span class="options">${(b.options ?? []).map((o) => `<b>${txt(o, p)}</b>`).join(" / ")}</span> ${txt(b.apres ?? "", p)}</div>`;
    case "ligne": return `<div class="bloc">${pic(t)}${txt(t, p)}</div>`;
    case "grille": {
      const n = Math.max(1, Math.min(4, Number(b.colonnes ?? 3)));
      return `<div class="bloc grille" style="grid-template-columns:repeat(${n},1fr)">${(b.items ?? []).map((i) => `<div>${txt(i, p)}</div>`).join("")}</div>`;
    }
    case "colonnes":
      return `<div class="bloc deux-col"><div>${(b.gauche ?? []).map((x) => blocHtml(x, p)).join("")}</div><div>${(b.droite ?? []).map((x) => blocHtml(x, p)).join("")}</div></div>`;
    case "droite_graduee": case "repere":
      return `<div class="bloc figure">${b.titre ? `<div class="fig-titre">${txt(b.titre, p)}</div>` : ""}${svgFigure(b)}</div>`;
    case "question": {
      const pts = b.points != null && b.points !== "" ? `<span class="points">${nombreFr(b.points)} pt${Number(b.points) > 1 ? "s" : ""}</span>` : "";
      const num = b.numero ? `<b>${echapper(String(b.numero).replace(/[.)]+$/, ""))}.</b> ` : "";
      return `<div class="bloc question ${p.reperes ? "repere-question" : ""}">${pic(t)}${num}${txt(t, p)}${pts}</div>`;
    }
    case "document": {
      const lignes = String(t).split(/\n/);
      const num = p.lignesNum || p.paragraphesNum;
      const corps = num ? lignes.map((l, i) => {
        const n = p.paragraphesNum ? `${i + 1}` : ((i + 1) % 5 === 0 ? String(i + 1) : "");
        return `<div class="ligne-num"><span class="num">${n}</span><span>${txt(l, p)}</span></div>`;
      }).join("") : `<div>${txt(t, p)}</div>`;
      return `<div class="bloc document">${b.titre ? `<div class="doc-titre">${txt(b.titre, p)}</div>` : ""}${corps}</div>`;
    }
    case "qcm": {
      const props = b.propositions ?? b.options ?? [];
      return `<div class="bloc qcm">${t ? `<div>${txt(t, p)}</div>` : ""}${props.map((o) => `<div class="choix"><span class="case">☐</span> ${txt(typeof o === "string" ? o : o.texte ?? "", p)}</div>`).join("")}</div>`;
    }
    case "trous": {
      const banque = b.banque_mots ?? b.banque ?? [];
      return `<div class="bloc"><div>${txt(t, p).replace(/_{3,}/g, "<span class='trou'></span>")}</div>${banque.length ? `<div class="banque">Mots possibles : ${banque.map((m) => `<span>${echapper(m)}</span>`).join(" ")}</div>` : ""}</div>`;
    }
    case "trame":
      return `<div class="bloc trame">${(b.debuts ?? b.items ?? (t ? [t] : [])).map((i) => `<div>${txt(i, p)} <span class="suite"></span></div>`).join("")}</div>`;
    case "checklist":
      return `<div class="bloc encadre checklist"><div class="encadre-titre">${echapper(b.titre ?? "J’ai fini quand…")}</div>${(b.items ?? []).map((i) => `<div><span class="case">☐</span> ${txt(i, p)}</div>`).join("")}</div>`;
    case "zone_reponse": {
      const n = Math.max(1, Math.min(12, Number(b.lignes ?? 2)));
      return `<div class="bloc zone">${"<div class='ligne-ecriture'></div>".repeat(n)}</div>`;
    }
    case "saut_page": return `<div class="saut-page"></div>`;
    case "exemple": return `<div class="bloc exemple"><b>Exemple — </b>${txt(t, p)}</div>`;
    case "exercice": return `<div class="bloc"><b>Exercice — </b>${txt(t, p)}</div>`;
    default: return t ? `<div class="bloc">${txt(t, p)}</div>` : "";
  }
}

export function cssRendu(p) {
  const pad = p.aere ? "2.2cm" : "1.6cm";
  return `
.rendu{font-family:${p.police};font-size:${p.taille}pt;line-height:${p.interligne};background:${p.fond};color:${p.couleurTexte};padding:${pad};text-align:left;hyphens:none;${p.aere ? "letter-spacing:.02em;word-spacing:.06em;" : ""}}
.rendu .titre-sujet{color:${BLEU};text-align:center;font-size:${p.taille + 5}pt;font-weight:bold;margin:0 0 .3em}
.rendu .identite{display:flex;justify-content:space-between;margin-bottom:.8em}
.rendu .exo{border:1.5px solid ${BLEU};border-radius:3px;padding:.5em .8em .6em;margin:0 0 .9em;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.rendu .exo-tete{break-after:avoid}
.rendu .exo .bloc:has(+ .figure){break-after:avoid}
.rendu .exo table,.rendu .exo .figure,.rendu .exo .encadre,.rendu .exo .grille,.rendu .exo .deux-col,.rendu .exo .bloc{break-inside:avoid}
.rendu .exo.libre{border:none;padding:0}
.rendu .exo-tete{display:flex;justify-content:space-between;align-items:baseline;color:${BLEU};font-weight:bold;margin-bottom:.3em}
.rendu .progression{font-size:.8em;color:#666;margin-bottom:.2em}
.rendu .bloc{margin:${p.aere ? ".55em" : ".35em"} 0}
.rendu .encadre{background:rgba(31,78,140,.07);border-radius:4px;padding:.45em .8em}
.rendu .encadre ul{margin:.2em 0;padding-left:1.1em}
.rendu .encadre-titre{font-weight:bold;margin-bottom:.15em}
.rendu .lexique{margin-bottom:.9em}
.rendu .donnees{display:flex;flex-wrap:wrap;gap:.4em 1.8em;align-items:baseline}
.rendu .options b{margin:0 .25em}
.rendu table.tab{border-collapse:collapse;margin:.2em 0}
.rendu table.tab th,.rendu table.tab td{border:1px solid #333;padding:.2em .7em;text-align:center;min-width:3.2em}
.rendu table.tab th{background:rgba(31,78,140,.08);font-weight:bold}
.rendu table.tab td.vide{height:${p.grandesZones ? "2.6em" : "1.9em"};min-width:6em}
.rendu table.tab td.case-c{font-size:1.15em}
.rendu table.zebre tr:nth-child(even) td{background:rgba(0,0,0,.04)}
.rendu .grille{display:grid;gap:.4em 1.2em}
.rendu .deux-col{display:grid;grid-template-columns:auto 1fr;gap:1.2em;align-items:start}
.rendu .figure svg{max-width:100%;height:auto;display:block}
.rendu .fig-titre{font-weight:bold;font-size:.9em}
.rendu .document{border-left:3px solid #999;padding:.2em .7em;background:rgba(255,255,255,.4)}
.rendu .doc-titre{font-weight:bold;margin-bottom:.15em}
.rendu .ligne-num{display:flex;gap:.7em}.rendu .ligne-num .num{min-width:1.6em;text-align:right;color:#888;font-size:.8em}
.rendu .points{float:right;font-size:.85em;color:#555;margin-left:1em}
.rendu .repere-consigne{border-left:4px solid #2F6FB0;padding-left:.5em}
.rendu .repere-question{border-left:4px solid #C26A12;padding-left:.5em}
.rendu .picto{margin-right:.35em}
.rendu .zone .ligne-ecriture{border-bottom:1px dotted #666;height:${p.grandesZones ? "1.4cm" : "0.95cm"}}
.rendu .qcm .choix{margin:.2em 0 .2em 1em}.rendu .case{font-size:1.1em}
.rendu .trou{display:inline-block;min-width:6em;border-bottom:1px solid #333;margin:0 .2em}
.rendu .banque span{display:inline-block;border:1px solid #999;border-radius:4px;padding:0 .4em;margin:.15em}
.rendu .trame .suite{display:inline-block;width:55%;border-bottom:1px dotted #666}
.rendu .checklist{border:1.5px dashed ${BLEU};background:transparent}
.rendu .plan{border:1px solid #aaa;border-radius:4px;padding:.3em .8em;margin-bottom:.8em}
.rendu .saut-page{break-after:page;page-break-after:always;height:0}
${p.saut ? ".rendu .exo{break-after:page;page-break-after:always}.rendu .exo:last-of-type{break-after:auto}" : ""}
.rendu .corrige table{border-collapse:collapse;width:100%;font-size:.9em}.rendu .corrige td,.rendu .corrige th{border:1px solid #999;padding:.25em .5em;text-align:left;vertical-align:top}
table.mise-page{width:100%;border-collapse:collapse}table.mise-page td{padding:0}
@media print{@page{size:A4;margin:0}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:${p.fond}}.rendu{padding-top:0;padding-bottom:0}}`;
}

export function rendreHtml(contenu, p, options = {}) {
  const c = normaliser(contenu);
  const n = c.sections.length;
  const plan = p.plan && n > 1 ? `<div class="plan"><b>Plan</b><ol>${c.sections.map((s) => `<li>${echapper(s.titre ?? s.id)}</li>`).join("")}</ol></div>` : "";
  const total = c.bareme?.reduce((t, b) => t + (Number(b.points) || 0), 0);
  const note = total ? `Note : ……… / ${nombreFr(total)}` : "";
  const identite = `<div class="identite"><span>Nom, prénom : ……………………………………${options.identifiant ? `&nbsp;&nbsp;<span style="color:#999;font-size:.75em">${echapper(options.identifiant)}</span>` : ""}</span><span>${c.duree_minutes ? `Durée : ${echapper(c.duree_minutes)} min&nbsp;&nbsp;&nbsp;` : ""}${note}</span></div>`;
  const sections = c.sections.map((s, i) => {
    const prog = p.progression && n > 1 ? `<div class="progression">Partie ${i + 1} sur ${n}${s.duree_minutes && p.minuteur ? ` · ⏱ ${echapper(s.duree_minutes)} min conseillées` : ""}</div>` : "";
    const pts = s.points != null && s.points !== "" ? `<span>…… / ${echapper(typeof s.points === "number" ? nombreFr(s.points) : s.points)}</span>` : "";
    // Le lexique global se place hors cadre
    const blocs = s.blocs ?? [];
    const entete = (s.titre || pts) ? `<div class="exo-tete"><span>${txt(s.titre ?? "", p)}</span>${pts}</div>` : "";
    const classe = entete ? "exo" : "exo libre";
    return `<section class="${classe}" data-index="${i}">${prog}${entete}${blocs.map((b) => blocHtml(b, p)).join("")}</section>`;
  }).join("");
  return `<div class="rendu"><div class="titre-sujet">${txt(c.titre, p)}</div>${identite}${plan}${sections}</div>`;
}

/** Enveloppe d'impression : marges répétées sur chaque page, sans en-têtes du navigateur. */
export function pourImpression(html, p) {
  const m = p.aere ? "1.8cm" : "1.3cm";
  return `<table class="mise-page"><thead><tr><td><div style="height:${m}"></div></td></tr></thead><tfoot><tr><td><div style="height:${m}"></div></td></tr></tfoot><tbody><tr><td>${html}</td></tr></tbody></table>`;
}

export function rendreCorrigeHtml(contenu, p, options = {}) {
  const c = normaliser(contenu);
  const lignes = (c.corrige ?? []).map((r) => `<tr><td>${echapper(r.question)}</td><td>${echapper(r.reponse)}</td><td>${echapper(r.bareme ?? "")}</td></tr>`).join("");
  return `<div class="rendu corrige"><div class="titre-sujet">Corrigé et barème (pour l’enseignant)</div><p>${echapper(c.titre)}${options.identifiant ? ` — ${echapper(options.identifiant)}` : ""}</p>${lignes ? `<table><tr><th>Question</th><th>Réponse attendue</th><th>Barème</th></tr>${lignes}</table>` : "<p>Pas de corrigé pour cette version.</p>"}</div>`;
}

export function pageHtmlAutonome(contenu, p, options = {}) {
  const corps = rendreHtml(contenu, p, options);
  const outils = [];
  if (p.audio) outils.push(`<button onclick="lireTout()">🔊 Écouter</button><button onclick="speechSynthesis.cancel()">⏹ Stop</button>`);
  if (p.regle) outils.push(`<button onclick="document.body.classList.toggle('avec-regle')">📏 Règle de lecture</button>`);
  if (p.pasAPas) outils.push(`<button onclick="pas(-1)">◀ Précédent</button><span id="pos"></span><button onclick="pas(1)">Suivant ▶</button>`);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(normaliser(contenu).titre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;600&display=swap" rel="stylesheet">
<link href="https://fonts.cdnfonts.com/css/opendyslexic" rel="stylesheet">
<style>body{margin:0;background:${p.fond}}.rendu{max-width:21cm;margin:0 auto}.outils{position:sticky;top:0;background:#fff;border-bottom:1px solid #ccc;padding:.5em;display:flex;gap:.5em;flex-wrap:wrap;z-index:5;font-family:Arial}
.outils button{font-size:16px;padding:.4em .8em;border-radius:6px;border:1px solid #888;background:#f4f4f4;cursor:pointer}
#regle{display:none;position:fixed;left:0;right:0;height:2.2em;background:rgba(255,235,59,.35);pointer-events:none;z-index:4}.avec-regle #regle{display:block}
.pas-a-pas section{display:none}.pas-a-pas section.active{display:block}
${cssRendu(p)}</style></head><body${p.pasAPas ? ' class="pas-a-pas"' : ""}>
${outils.length ? `<div class="outils">${outils.join("")}</div>` : ""}<div id="regle"></div>${corps}
<script>
document.addEventListener('mousemove',e=>{const r=document.getElementById('regle');r.style.top=(e.clientY-14)+'px'});
function lireTout(){speechSynthesis.cancel();const zone=document.querySelector('.pas-a-pas section.active')||document.querySelector('.rendu');const u=new SpeechSynthesisUtterance(zone.innerText);u.lang='fr-FR';u.rate=.95;speechSynthesis.speak(u)}
let i=0;const S=[...document.querySelectorAll('.rendu section')];
function pas(d){if(!S.length)return;i=Math.max(0,Math.min(S.length-1,i+d));S.forEach((s,k)=>s.classList.toggle('active',k===i));const p=document.getElementById('pos');if(p)p.textContent=(i+1)+' / '+S.length;window.scrollTo(0,0)}
${p.pasAPas ? "pas(0);" : ""}
</script></body></html>`;
}

export function tiersTemps(min) {
  if (!min) return null;
  const t = Math.round(Number(min) * 4 / 3);
  const h = Math.floor(t / 60), m = t % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

/** Liste des blocs figures (y compris dans les colonnes), pour préparer les images Word. */
export function figuresDe(contenu) {
  const out = [];
  const visiter = (b) => {
    if (!b) return;
    if (FIGURES.has(b.type)) out.push(b);
    for (const x of [...(b.gauche ?? []), ...(b.droite ?? [])]) visiter(x);
  };
  for (const s of normaliser(contenu).sections) for (const b of s.blocs ?? []) visiter(b);
  return out;
}

// ---------------------------------------------------------------------
//  Export Word
// ---------------------------------------------------------------------
export function docxDepuisContenu(docx, contenu, p, options = {}) {
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak, ShadingType, ImageRun, TabStopType, AlignmentType } = docx;
  const c = normaliser(contenu);
  const images = options.images ?? new Map();
  const police = p.police.split(",")[0].replace(/'/g, "").trim();
  const taille = Math.round(p.taille * 2);
  const interligne = Math.round(p.interligne * 240);
  const espace = p.aere ? 140 : 80;
  const morceaux = (l, extra) => l.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((m) => m.startsWith("**")
    ? new TextRun({ text: m.slice(2, -2), font: police, size: taille, ...extra, bold: true })
    : new TextRun({ text: m, font: police, size: taille, ...extra }));
  const runs = (t, extra = {}) => {
    const s = p.nombres ? nombresLisibles(String(t ?? "")) : String(t ?? "");
    return s.split("\n").flatMap((l, i) => i === 0 ? morceaux(l, extra) : [new TextRun({ break: 1 }), ...morceaux(l, extra)]);
  };
  const para = (t, opts = {}, extra = {}) => new Paragraph({ children: runs(t, extra), spacing: { line: interligne, after: espace }, ...opts });
  const fill = "EAF0F7";
  const ligneEcriture = () => new Paragraph({ children: [new TextRun({ text: " ", size: taille })], spacing: { line: p.grandesZones ? 700 : 460 },
    border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: "666666", space: 1 } } });
  const tableau = (rows, enteteLignes = 1) => {
    const nCol = Math.max(...rows.map((l) => (Array.isArray(l) ? l : Object.values(l)).length));
    const total = Math.min(9600, Math.max(4000, nCol * 1500));
    const col = Math.floor(total / nCol);
    return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: Array(nCol).fill(col),
    rows: rows.map((l, i) => new TableRow({
      tableHeader: i < enteteLignes,
      children: (Array.isArray(l) ? l : Object.values(l)).map((cel, j) => {
        const v = cel == null ? "" : String(cel);
        const th = i < enteteLignes || (j === 0 && enteteLignes > 0);
        return new TableCell({
          children: [para(v, { alignment: AlignmentType.CENTER, spacing: { line: interligne, before: 40, after: 40 } }, th ? { bold: true } : {})],
          shading: th ? { type: ShadingType.CLEAR, fill } : undefined,
          width: { size: col, type: WidthType.DXA },
        });
      }),
    })),
  });
  };
  const image = (b) => {
    const img = images.get(b);
    if (!img) return para(b.titre ? `${b.titre} (figure)` : "(figure)");
    const echelle = Math.min(1, 600 / img.largeur);
    return new Paragraph({ children: [new ImageRun({ type: "png", data: img.data, transformation: { width: Math.round(img.largeur * echelle), height: Math.round(img.hauteur * echelle) } })], spacing: { after: espace } });
  };
  const enfants = [];
  const bloc = (b) => {
    const t = texteBloc(b);
    switch (b.type) {
      case "lexique":
        enfants.push(para("Mon lexique", { shading: { type: ShadingType.CLEAR, fill } }, { bold: true }));
        (b.items ?? []).forEach((i) => enfants.push(para(`• **${i.terme ?? ""}** : ${i.definition ?? ""}`, { shading: { type: ShadingType.CLEAR, fill } })));
        break;
      case "encadre": case "a_retenir": case "definition": case "rappel": {
        const titre = b.titre ?? (b.type === "a_retenir" ? "À retenir" : b.type === "definition" ? "Définition" : "");
        if (titre) enfants.push(para(titre, { shading: { type: ShadingType.CLEAR, fill } }, { bold: true }));
        (Array.isArray(b.items) ? b.items.map((x) => "• " + x) : [t]).forEach((x) => enfants.push(para(x, { shading: { type: ShadingType.CLEAR, fill } })));
        break;
      }
      case "consigne": case "etape": case "ligne":
        enfants.push(para((b.type === "etape" && b.numero ? `${b.numero}) ` : "") + (p.pictos ? picto(t) + " " : "") + t)); break;
      case "donnees": enfants.push(para(`${b.intro ?? ""}    ${(b.valeurs ?? []).map((v) => `**${v}**`).join("      ")}`)); break;
      case "choix": enfants.push(para(`${b.avant ?? t} ${(b.options ?? []).map((o) => `**${o}**`).join("  /  ")} ${b.apres ?? ""}`)); break;
      case "grille": {
        const n = Math.max(1, Math.min(4, Number(b.colonnes ?? 3)));
        const items = b.items ?? [];
        for (let i = 0; i < items.length; i += n) enfants.push(para(items.slice(i, i + n).join("\t\t"), { tabStops: [{ type: TabStopType.LEFT, position: 3200 }, { type: TabStopType.LEFT, position: 6400 }] }));
        break;
      }
      case "tableau": {
        const rows = [...(b.colonnes ? [b.colonnes] : []), ...(b.lignes ?? [])];
        if (rows.length) { enfants.push(tableau(rows, b.colonnes ? 1 : 0)); enfants.push(para("")); }
        break;
      }
      case "colonnes": (b.gauche ?? []).forEach(bloc); (b.droite ?? []).forEach(bloc); break;
      case "droite_graduee": case "repere":
        if (b.titre) enfants.push(para(b.titre, {}, { bold: true }));
        enfants.push(image(b)); break;
      case "question":
        enfants.push(para(`${b.numero ? String(b.numero).replace(/[.)]+$/, "") + ". " : ""}${p.pictos ? picto(t) + " " : ""}${t}${b.points != null ? `   (${nombreFr(b.points)} pt${Number(b.points) > 1 ? "s" : ""})` : ""}`)); break;
      case "document":
        if (b.titre) enfants.push(para(b.titre, {}, { bold: true }));
        String(t).split("\n").forEach((l, i) => enfants.push(para((p.lignesNum && (i + 1) % 5 === 0 ? `${i + 1}  ` : "") + l, { indent: { left: 300 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: "999999", space: 8 } } })));
        break;
      case "zone_reponse": for (let k = 0; k < Math.max(1, Number(b.lignes ?? 2)); k++) enfants.push(ligneEcriture()); break;
      case "qcm": if (t) enfants.push(para(t)); (b.propositions ?? []).forEach((o) => enfants.push(para(`☐  ${typeof o === "string" ? o : o.texte ?? ""}`, { indent: { left: 360 } }))); break;
      case "trous":
        enfants.push(para(String(t).replace(/_{3,}/g, "______________")));
        if ((b.banque_mots ?? []).length) enfants.push(para(`Mots possibles : ${b.banque_mots.join("  •  ")}`, {}, { italics: true }));
        break;
      case "trame": (b.debuts ?? b.items ?? []).forEach((d) => enfants.push(para(`${d} ……………………………………`))); break;
      case "checklist": enfants.push(para(b.titre ?? "J’ai fini quand…", {}, { bold: true })); (b.items ?? []).forEach((i) => enfants.push(para(`☐  ${i}`))); break;
      case "saut_page": enfants.push(new Paragraph({ children: [new PageBreak()] })); break;
      default: if (t) enfants.push(para(t));
    }
  };
  const total = c.bareme?.reduce((t, b) => t + (Number(b.points) || 0), 0);
  enfants.push(new Paragraph({ children: runs(c.titre, { bold: true, size: taille + 10, color: "1F4E8C" }), alignment: AlignmentType.CENTER, spacing: { after: 160 } }));
  enfants.push(para(`Nom, prénom : ……………………………………${options.identifiant ? "   " + options.identifiant : ""}\t${total ? `Note : ……… / ${nombreFr(total)}` : ""}`, { tabStops: [{ type: TabStopType.RIGHT, position: 9600 }] }));
  c.sections.forEach((s, si) => {
    if (si > 0 && p.saut) enfants.push(new Paragraph({ children: [new PageBreak()] }));
    if (p.progression && c.sections.length > 1) enfants.push(para(`Partie ${si + 1} sur ${c.sections.length}`, {}, { italics: true, size: Math.max(taille - 4, 18), color: "666666" }));
    const pts = s.points != null && s.points !== "" ? `…… / ${typeof s.points === "number" ? nombreFr(s.points) : s.points}` : "";
    enfants.push(new Paragraph({
      children: [...runs(s.titre ?? "", { bold: true, color: "1F4E8C" }), new TextRun({ text: `\t${pts}`, bold: true, color: "1F4E8C", font: police, size: taille })],
      tabStops: [{ type: TabStopType.RIGHT, position: 9600 }],
      border: { top: { style: BorderStyle.SINGLE, size: 12, color: "1F4E8C", space: 4 } },
      spacing: { before: 240, after: 100 },
    }));
    (s.blocs ?? []).forEach(bloc);
  });
  const fond = p.fond.replace("#", "");
  return new Document({
    creator: "Adaptateur PAP",
    title: c.titre,
    ...(fond !== "FFFFFF" ? { background: { color: fond } } : {}),
    styles: { default: { document: { run: { font: police, size: taille } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: enfants }],
  });
}

// =====================================================================
//  v3 — Documents composés en HTML selon la charte
// =====================================================================
export function cssCharte(p) {
  return `
.sujet{font-family:${p.police};font-size:${p.taille}pt;line-height:${p.interligne};color:${p.couleurTexte};background:${p.fond};padding:0 1.6cm;text-align:left;hyphens:none;${p.aere ? "letter-spacing:.02em;word-spacing:.06em;" : ""}}
.sujet h1{color:${BLEU};text-align:center;font-size:1.3em;margin:0 0 .2em;line-height:1.25}
.sujet .entete{display:flex;justify-content:space-between;margin:.3em 0 .8em}
.sujet .lexique{background:rgba(31,78,140,.08);border-radius:4px;padding:.4em .9em;margin-bottom:.9em}
.sujet b.t{display:block;margin-bottom:.1em}
.sujet ul{margin:.1em 0;padding-left:1.1em}
.sujet .exo{border:1.6px solid ${BLEU};border-radius:3px;padding:.45em .9em .6em;margin:0 0 .9em;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.sujet .exo>header{display:flex;justify-content:space-between;gap:1em;color:${BLEU};font-weight:bold;margin-bottom:.25em;break-after:avoid}
.sujet p{margin:.35em 0}
.sujet .encadre{background:rgba(31,78,140,.08);border-radius:4px;padding:.35em .8em;margin:.35em 0}
.sujet .donnees{display:flex;flex-wrap:wrap;gap:.3em 1.6em;font-weight:bold;margin:.35em 0}
.sujet .donnees span.i{font-weight:normal}
.sujet table.rep{border-collapse:collapse;margin:.3em 0;max-width:100%}
.sujet table.rep th,.sujet table.rep td{border:1px solid #333;padding:.15em .45em;text-align:center;min-width:1.6em;hyphens:manual;word-break:normal;overflow-wrap:normal}
.sujet table.rep th{background:rgba(31,78,140,.08)}
.sujet table.rep td.v{height:${p.grandesZones ? "2.6em" : "1.9em"};min-width:2.4em}
.sujet .case{font-size:1.15em}
.sujet .grille{display:grid;gap:.25em 1.4em;margin:.35em 0}
.sujet .g2{grid-template-columns:1fr 1fr}.sujet .g3{grid-template-columns:1fr 1fr 1fr}
.sujet .deux-col{display:grid;grid-template-columns:auto 1fr;gap:1.2em;align-items:start}
.sujet .figure svg{display:block;max-width:100%;height:auto}
.sujet .figure-svg{margin:.4em 0;break-inside:avoid}.sujet .figure-svg svg{display:block;max-width:100%;height:auto;margin:0 auto}.sujet .figure-svg .fig-titre{text-align:center}
.sujet .fig-titre{font-weight:bold;font-size:.85em;margin-top:.3em}
.sujet .figure-a-dessiner{border:2px dashed #2F6FB0;padding:.5em;color:#1F4E8C;font-style:italic}
.sujet .figure-originale{border:2px dashed #C26A12;padding:.5em;color:#7A4A00;font-style:italic}
.sujet .etape{margin:.3em 0 .3em .2em}
.sujet .etape b.n{color:${BLEU}}
.sujet .entoure b{margin:0 .3em}
.sujet .check{border:1.5px dashed ${BLEU};border-radius:4px;padding:.25em .8em;margin:.4em 0;font-size:.92em}
.sujet .lignes .l{border-bottom:1px dotted #666;height:${p.grandesZones ? "1.4cm" : "0.95cm"}}
.sujet table,.sujet .figure,.sujet .encadre,.sujet .grille,.sujet .deux-col,.sujet .check,.sujet p,.sujet .etape{break-inside:avoid}
.sujet p:has(+ .figure),.sujet .figure,.sujet p:has(+ .figure-svg),.sujet p:has(+ .lignes),.sujet p:has(+ .reponse){break-after:avoid}
.sujet[contenteditable=true]{outline:2px dashed #2F6FB0;outline-offset:4px}
.corrige-doc{font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.3;color:#111;background:#fff;padding:0 1.6cm}
.corrige-doc h2{color:${BLEU};text-align:center}
.corrige-doc table{border-collapse:collapse;width:100%}.corrige-doc th,.corrige-doc td{border:1px solid #999;padding:.25em .45em;text-align:left;vertical-align:top}
.corrige-doc th{background:#EEF2F8}
table.mise-page{width:100%;border-collapse:collapse}table.mise-page>*>tr>td{padding:0}
@media print{@page{size:A4;margin:0}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:${p.fond}}}`;
}

function figureDepuisAttribut(txtJson) {
  try { return JSON.parse(txtJson); } catch { return null; }
}

/** Remplace les blocs de données par les figures dessinées (version texte, pour l'impression et l'export). */
export function hydraterHtml(html) {
  if (typeof document !== "undefined") {
    const t = document.createElement("template"); t.innerHTML = String(html ?? "");
    hydraterDom(t.content);
    const d = document.createElement("div"); d.append(t.content);
    d.querySelectorAll("[contenteditable]").forEach((x) => x.removeAttribute("contenteditable"));
    return d.innerHTML;
  }
  return String(html ?? "")
    .replace(/<div class="figure" data-fig='([^']*)'>\s*<\/div>/g, (m, j) => {
      const f = figureDepuisAttribut(j.replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
      if (!f) return "";
      return `<div class="figure">${f.titre ? `<div class="fig-titre">${echapper(f.titre)}</div>` : ""}${svgFigure(f)}</div>`;
    })
    .replace(/<div class="lignes" data-n="(\d+)">\s*<\/div>/g, (m, n) =>
      `<div class="lignes">${'<div class="l"></div>'.repeat(Math.max(1, Math.min(12, +n)))}</div>`);
}

/** Même opération sur un conteneur DOM (aperçu) en gardant les données pour l'enregistrement. */
export function hydraterDom(racine) {
  racine.querySelectorAll(".figure[data-fig]").forEach((el) => {
    const f = figureDepuisAttribut(el.getAttribute("data-fig"));
    if (!f) return;
    el.innerHTML = `${f.titre ? `<div class="fig-titre">${echapper(f.titre)}</div>` : ""}${svgFigure(f)}`;
    el.setAttribute("contenteditable", "false");
  });
  racine.querySelectorAll(".figure-svg").forEach((el) => el.setAttribute("contenteditable", "false"));
  racine.querySelectorAll(".lignes[data-n]").forEach((el) => {
    el.innerHTML = '<div class="l"></div>'.repeat(Math.max(1, Math.min(12, +el.getAttribute("data-n"))));
    el.setAttribute("contenteditable", "false");
  });
}

/** HTML à enregistrer depuis l'aperçu (figures et lignes ramenées à leurs données). */
export function htmlPourStockage(racine) {
  const c = racine.cloneNode(true);
  c.querySelectorAll(".figure[data-fig],.lignes[data-n]").forEach((el) => { el.innerHTML = ""; el.removeAttribute("contenteditable"); });
  c.querySelectorAll(".figure-svg").forEach((el) => el.removeAttribute("contenteditable"));
  return c.innerHTML;
}

export function corrigeHtml(contenu, titre, identifiant) {
  const lignes = (contenu?.corrige ?? []).map((r) => `<tr><td>${echapper(r.exercice ?? r.question ?? "")}</td><td>${echapper(r.reponses ?? r.reponse ?? "")}</td><td>${echapper(r.bareme ?? "")}</td></tr>`).join("");
  return `<div class="corrige-doc"><h2>Corrigé et barème (pour l’enseignant)</h2><p>${echapper(titre ?? "")}${identifiant ? ` — ${echapper(identifiant)}` : ""}</p>${lignes ? `<table><tr><th>Ex.</th><th>Réponses attendues</th><th>Barème</th></tr>${lignes}</table>` : "<p>Pas de corrigé.</p>"}</div>`;
}

export function pageAutonomeV3(html, p, titre) {
  const outils = [];
  if (p.audio) outils.push(`<button onclick="lireTout()">🔊 Écouter</button><button onclick="speechSynthesis.cancel()">⏹ Stop</button>`);
  if (p.regle) outils.push(`<button onclick="document.body.classList.toggle('avec-regle')">📏 Règle de lecture</button>`);
  if (p.pasAPas) outils.push(`<button onclick="pas(-1)">◀ Précédent</button><span id="pos"></span><button onclick="pas(1)">Suivant ▶</button>`);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(titre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;600&display=swap" rel="stylesheet"><link href="https://fonts.cdnfonts.com/css/opendyslexic" rel="stylesheet">
<style>body{margin:0;background:${p.fond}}.sujet{max-width:21cm;margin:0 auto;padding-top:1.2cm;padding-bottom:1.2cm}.outils{position:sticky;top:0;background:#fff;border-bottom:1px solid #ccc;padding:.5em;display:flex;gap:.5em;flex-wrap:wrap;z-index:5;font-family:Arial}
.outils button{font-size:16px;padding:.4em .8em;border-radius:6px;border:1px solid #888;background:#f4f4f4;cursor:pointer}
#regle{display:none;position:fixed;left:0;right:0;height:2.2em;background:rgba(255,235,59,.35);pointer-events:none;z-index:4}.avec-regle #regle{display:block}
.pas-a-pas .exo{display:none}.pas-a-pas .exo.active{display:block}${cssCharte(p)}</style></head><body${p.pasAPas ? ' class="pas-a-pas"' : ""}>
${outils.length ? `<div class="outils">${outils.join("")}</div>` : ""}<div id="regle"></div><div class="sujet">${hydraterHtml(html)}</div>
<script>
document.addEventListener('mousemove',e=>{const r=document.getElementById('regle');r.style.top=(e.clientY-14)+'px'});
function lireTout(){speechSynthesis.cancel();const z=document.querySelector('.pas-a-pas .exo.active')||document.querySelector('.sujet');const u=new SpeechSynthesisUtterance(z.innerText);u.lang='fr-FR';u.rate=.95;speechSynthesis.speak(u)}
let i=0;const S=[...document.querySelectorAll('.sujet .exo')];
function pas(d){if(!S.length)return;i=Math.max(0,Math.min(S.length-1,i+d));S.forEach((s,k)=>s.classList.toggle('active',k===i));const p=document.getElementById('pos');if(p)p.textContent=(i+1)+' / '+S.length;scrollTo(0,0)}
${p.pasAPas ? "pas(0);" : ""}</script></body></html>`;
}

/** Word depuis le document HTML (DOM), figures fournies en PNG. */
export function docxDepuisDom(docx, racine, p, images = new Map()) {
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, ImageRun, TabStopType, AlignmentType } = docx;
  const police = p.police.split(",")[0].replace(/'/g, "").trim();
  const taille = Math.round(p.taille * 2), interligne = Math.round(p.interligne * 240), apres = p.aere ? 120 : 70;
  const fill = "EAF0F7";
  const runsDe = (noeud, style = {}) => {
    const out = [];
    noeud.childNodes.forEach((n) => {
      if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, " "); if (t) out.push(new TextRun({ text: p.nombres ? nombresLisibles(t) : t, font: police, size: taille, ...style })); }
      else if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        if (tag === "br") out.push(new TextRun({ break: 1 }));
        else if (n.classList?.contains("figure")) { /* traité à part */ }
        else out.push(...runsDe(n, (tag === "b" || tag === "strong" || tag === "th") ? { ...style, bold: true } : (tag === "i" || tag === "em") ? { ...style, italics: true } : tag === "sup" ? { ...style, superScript: true } : style));
      }
    });
    return out;
  };
  const para = (children, opts = {}) => new Paragraph({ children, spacing: { line: interligne, after: apres }, ...opts });
  const enfants = [];
  const tableDe = (tab, bordures = true) => {
    const rows = [...tab.querySelectorAll("tr")];
    if (!rows.length) return;
    const nCol = Math.max(...rows.map((r) => r.children.length));
    const longueurs = Array.from({ length: nCol }, (_, k) => Math.max(3, ...rows.map((r) => (r.children[k]?.textContent ?? "").trim().length)));
    const somme = longueurs.reduce((a, b) => a + b, 0);
    const total = (!bordures || somme > 45) ? 9600 : Math.min(9600, Math.max(3600, nCol * 1500));
    const largeurs = longueurs.map((l) => Math.max(800, Math.round(total * l / somme)));
    const ajust = total / largeurs.reduce((a, b) => a + b, 0);
    largeurs.forEach((l, k) => { largeurs[k] = Math.floor(l * ajust); });
    const sans = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    enfants.push(new Table({
      width: { size: total, type: WidthType.DXA }, columnWidths: largeurs,
      rows: rows.map((r) => new TableRow({ children: [...r.children].map((c, k) => new TableCell({
        children: [para(runsDe(c, c.tagName === "TH" ? { bold: true } : {}), { alignment: bordures ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { line: interligne, before: 30, after: 30 } })],
        shading: c.tagName === "TH" && bordures ? { type: ShadingType.CLEAR, fill } : undefined,
        width: { size: largeurs[k] ?? largeurs[0], type: WidthType.DXA },
        ...(bordures ? {} : { borders: { top: sans, bottom: sans, left: sans, right: sans } }),
      })) })),
    }));
    enfants.push(para([]));
  };
  const figure = (el) => {
    const img = images.get(el);
    const f = figureDepuisAttribut(el.getAttribute("data-fig") ?? "");
    if (f?.titre) enfants.push(para([new TextRun({ text: f.titre, bold: true, font: police, size: Math.max(taille - 4, 18) })]));
    if (!img) return;
    const e = Math.min(1, 600 / img.largeur);
    enfants.push(new Paragraph({ children: [new ImageRun({ type: "png", data: img.data, transformation: { width: Math.round(img.largeur * e), height: Math.round(img.hauteur * e) } })], spacing: { after: apres } }));
  };
  const visiter = (el) => {
    if (el.nodeType === 3) { if (el.textContent.trim()) enfants.push(para(runsDe({ childNodes: [el] }))); return; }
    if (el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase(), cl = el.classList;
    if (tag === "h1") return enfants.push(para(runsDe(el, { bold: true, size: taille + 8, color: "1F4E8C" }), { alignment: AlignmentType.CENTER }));
    if (cl.contains("entete")) { const [a, b] = el.children; return enfants.push(para([...runsDe(a ?? el), new TextRun({ text: "\t" }), ...(b ? runsDe(b) : [])], { tabStops: [{ type: TabStopType.RIGHT, position: 9600 }] })); }
    if (cl.contains("figure")) return figure(el);
    if (cl.contains("figure-svg")) {
      const img = images.get(el), t = el.querySelector(".fig-titre")?.textContent?.trim();
      if (img) { const e = Math.min(1, 620 / img.largeur); enfants.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: img.data, transformation: { width: Math.round(img.largeur * e), height: Math.round(img.hauteur * e) } })], spacing: { after: 40 } })); }
      if (t) enfants.push(para([new TextRun({ text: t, bold: true, font: police, size: Math.max(taille - 4, 18) })], { alignment: AlignmentType.CENTER }));
      return;
    }
    if (cl.contains("lignes")) { const n = +(el.getAttribute("data-n") || el.children.length || 2); for (let k = 0; k < n; k++) enfants.push(new Paragraph({ children: [new TextRun({ text: " " })], spacing: { line: p.grandesZones ? 700 : 460 }, border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: "666666", space: 1 } } })); return; }
    if (cl.contains("lexique") || cl.contains("encadre") || cl.contains("check")) {
      const sh = cl.contains("check") ? {} : { shading: { type: ShadingType.CLEAR, fill } };
      el.childNodes.forEach((n) => {
        if (n.nodeType === 1 && n.tagName === "UL") n.querySelectorAll(":scope > li").forEach((li) => enfants.push(para([new TextRun({ text: "• ", font: police, size: taille }), ...runsDe(li)], sh)));
        else if (n.nodeType === 1 && n.matches?.("b.t")) enfants.push(para(runsDe(n, { bold: true }), sh));
        else if (n.textContent.trim()) enfants.push(para(runsDe(n.nodeType === 3 ? { childNodes: [n] } : n), sh));
      });
      return;
    }
    if (tag === "section") {
      const h = el.querySelector(":scope > header");
      if (h) { const [a, b] = h.children; enfants.push(new Paragraph({ children: [...runsDe(a ?? h, { bold: true, color: "1F4E8C" }), new TextRun({ text: "\t" }), ...(b ? runsDe(b, { bold: true, color: "1F4E8C" }) : [])], tabStops: [{ type: TabStopType.RIGHT, position: 9600 }], border: { top: { style: BorderStyle.SINGLE, size: 12, color: "1F4E8C", space: 4 } }, spacing: { before: 220, after: 90 } })); }
      [...el.childNodes].filter((n) => n !== h).forEach(visiter);
      return;
    }
    if (tag === "table") return tableDe(el, true);
    if (cl.contains("grille")) {
      const n = cl.contains("g3") ? 3 : 2, items = [...el.children];
      const t = el.ownerDocument.createElement("table");
      for (let i = 0; i < items.length; i += n) { const tr = el.ownerDocument.createElement("tr"); items.slice(i, i + n).forEach((it) => { const td = el.ownerDocument.createElement("td"); td.innerHTML = it.innerHTML; tr.append(td); }); t.append(tr); }
      return tableDe(t, false);
    }
    if (cl.contains("deux-col")) return [...el.children].forEach((c) => (c.tagName === "DIV" && !c.className ? [...c.childNodes].forEach(visiter) : visiter(c)));
    if (cl.contains("donnees")) return enfants.push(para([...el.children].flatMap((s, i) => [...(i ? [new TextRun({ text: "      " })] : []), ...runsDe(s, s.classList.contains("i") ? {} : { bold: true })])));
    if (tag === "ul" || tag === "ol") return el.querySelectorAll(":scope > li").forEach((li, i) => enfants.push(para([new TextRun({ text: tag === "ol" ? `${i + 1}. ` : "• ", font: police, size: taille }), ...runsDe(li)], { indent: { left: 300 } })));
    if (cl.contains("figure-originale")) return enfants.push(para(runsDe(el, { italics: true, color: "7A4A00" })));
    if (tag === "div" && [...el.children].some((c) => ["SECTION", "DIV", "TABLE", "UL", "P"].includes(c.tagName)) && !cl.contains("etape")) return [...el.childNodes].forEach(visiter);
    enfants.push(para(runsDe(el)));
  };
  [...racine.childNodes].forEach(visiter);
  const fond = p.fond.replace("#", "");
  return new Document({
    creator: "Adaptateur PAP",
    ...(fond !== "FFFFFF" ? { background: { color: fond } } : {}),
    styles: { default: { document: { run: { font: police, size: taille } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: enfants }],
  });
}
