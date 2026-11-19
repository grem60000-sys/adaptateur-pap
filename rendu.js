// =====================================================================
//  Adaptateur PAP — moteur de rendu (HTML et Word)
//  Applique les adaptations de mise en forme (familles A, C, I, J, K, L, CO)
//  au contenu structuré renvoyé par le moteur.
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

export const echapper = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texte d'un bloc, quel que soit le nom du champ utilisé. */
export function texteBloc(b) {
  return b.texte ?? b.contenu ?? b.enonce ?? b.consigne ?? b.question ?? b.text ?? "";
}

/** Nombres lisibles (J1) : espace fine entre les milliers, sans toucher aux années. */
export function nombresLisibles(t) {
  return String(t).replace(/\b\d{4,}(?:[.,]\d+)?\b/g, (n) => {
    const [ent, dec] = n.split(/([.,].*)/);
    if (ent.length === 4 && +ent >= 1900 && +ent <= 2100 && !dec) return n; // année
    return ent.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (dec ?? "");
  });
}

/** Version « Forme seule » calculée à partir de la structure (identique au moteur). */
export function structureVersContenu(s) {
  if (!s) return { titre: "", sections: [], bareme: [] };
  if (!s.exercices && s.parties) return coursVersContenu(s);
  const sections = (s.exercices ?? []).map((ex) => {
    const blocs = [];
    if (ex.consigne_generale) blocs.push({ type: "consigne", texte: ex.consigne_generale });
    for (const d of ex.documents ?? []) blocs.push({ type: "document", id: d.id, titre: d.titre, texte: d.contenu });
    for (const q of ex.questions ?? []) {
      blocs.push({ type: "question", id: q.id, numero: q.numero, texte: q.enonce, points: q.points });
      blocs.push({ type: "zone_reponse", question_id: q.id, lignes: 4 });
    }
    return { id: ex.id, titre: ex.titre, blocs };
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

/** Normalise un contenu (évaluation ou cours) en sections + blocs. */
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
  const adapte = codes.length > 0;
  return {
    codes: a,
    adapte,
    police: a.has("A1") ? (POLICES[prefs.police] ?? POLICES.Arial) : POLICES.Arial,
    taille: a.has("A2") ? Math.max(Number(prefs.taille ?? 14), tailleMin) : 12,
    interligne: a.has("A3") ? Math.max(Number(prefs.interligne ?? 1.5), 1.5) : 1.2,
    fond: a.has("A10") ? (FONDS[prefs.fond] ?? FONDS.creme) : "#FFFFFF",
    couleurTexte: a.has("A10") ? "#2B2B2B" : "#111111",
    aere: a.has("A4"),
    saut: a.has("A5") || a.has("I2"),
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
  [/\b(entour|coch|soulign|reli)/i, "⭕"],
  [/\b(écri|ecri|rédige|rédigez|justifie|justifiez|explique|expliquez|complète|complétez)/i, "✏️"],
];
function picto(t) {
  for (const [re, p] of PICTOS) if (re.test(t)) return p;
  return "";
}

function txt(t, p) {
  const s = p.nombres ? nombresLisibles(t) : String(t ?? "");
  // **gras** produit par l'IA
  return echapper(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

function documentHtml(b, p) {
  const titre = b.titre ? `<div class="doc-titre">${txt(b.titre, p)}</div>` : "";
  const t = texteBloc(b);
  let corps;
  if (p.lignesNum || p.paragraphesNum) {
    const lignes = String(t).split(/\n/);
    corps = lignes.map((l, i) => {
      const n = p.paragraphesNum ? `§${i + 1}` : ((i + 1) % 5 === 0 ? String(i + 1) : "");
      return `<div class="ligne"><span class="num">${n}</span><span>${txt(l, p)}</span></div>`;
    }).join("");
  } else corps = `<div>${txt(t, p)}</div>`;
  return `<div class="bloc document">${titre}${corps}</div>`;
}

function zoneHtml(b, p) {
  const n = Math.max(1, Number(b.lignes ?? 4));
  return `<div class="bloc zone ${p.grandesZones ? "grande" : ""}">${"<div class='ligne-ecriture'></div>".repeat(n)}</div>`;
}

function tableauHtml(b, p) {
  let lignes = b.lignes ?? b.rows ?? [];
  if (b.colonnes) lignes = [b.colonnes, ...lignes];
  if (!Array.isArray(lignes) || lignes.length === 0) return `<div class="bloc">${txt(texteBloc(b), p)}</div>`;
  const rows = lignes.map((l, i) => {
    const cells = (Array.isArray(l) ? l : Object.values(l)).map((c) =>
      i === 0 ? `<th>${txt(c, p)}</th>` : `<td>${txt(c, p)}</td>`).join("");
    const num = p.tableaux && i > 0 ? `<td class="num">${i}</td>` : (p.tableaux ? "<th></th>" : "");
    return `<tr>${num}${cells}</tr>`;
  }).join("");
  return `<div class="bloc"><table class="${p.tableaux ? "zebre" : ""}">${rows}</table></div>`;
}

export function blocHtml(b, p) {
  const type = b.type ?? "autre";
  const t = texteBloc(b);
  switch (type) {
    case "consigne":
    case "etape": {
      const pic = p.pictos ? `<span class="picto">${picto(t)}</span>` : "";
      const pre = type === "etape" && b.numero ? `<b>${echapper(b.numero)})</b> ` : "";
      return `<div class="bloc ${type} ${p.reperes ? "repere-consigne" : ""}">${pic}${pre}${txt(t, p)}</div>`;
    }
    case "question": {
      const pts = b.points != null && b.points !== "" ? `<span class="points">${echapper(b.points)} pt${Number(b.points) > 1 ? "s" : ""}</span>` : "";
      const pic = p.pictos ? `<span class="picto">${picto(t)}</span>` : "";
      const num = b.numero ? `<b>${echapper(b.numero)}.</b> ` : "";
      return `<div class="bloc question ${p.reperes ? "repere-question" : ""}" data-q="${echapper(b.id ?? "")}">${pic}${num}${txt(t, p)}${pts}</div>`;
    }
    case "document": return documentHtml(b, p);
    case "qcm": {
      const props = b.propositions ?? b.options ?? b.choix ?? [];
      return `<div class="bloc qcm">${t ? `<div>${txt(t, p)}</div>` : ""}${props.map((o) =>
        `<div class="choix"><span class="case">☐</span> ${txt(typeof o === "string" ? o : o.texte ?? o.text ?? "", p)}</div>`).join("")}</div>`;
    }
    case "trous": {
      const banque = b.banque_mots ?? b.banque ?? [];
      const corps = txt(t, p).replace(/_{3,}/g, "<span class='trou'></span>");
      return `<div class="bloc trous"><div>${corps}</div>${banque.length ? `<div class="banque">Mots possibles : ${banque.map((m) => `<span>${echapper(m)}</span>`).join(" ")}</div>` : ""}</div>`;
    }
    case "trame": {
      const items = b.debuts ?? b.items ?? b.lignes ?? (t ? [t] : []);
      return `<div class="bloc trame">${items.map((i) => `<div class="debut">${txt(i, p)} <span class="suite"></span></div>`).join("")}</div>`;
    }
    case "tableau": return tableauHtml(b, p);
    case "encadre":
    case "a_retenir":
    case "definition": {
      const titre = b.titre ?? (type === "a_retenir" ? "À retenir" : type === "definition" ? "Définition" : "");
      return `<div class="bloc encadre ${type}">${titre ? `<div class="encadre-titre">${txt(titre, p)}</div>` : ""}<div>${txt(t, p)}</div></div>`;
    }
    case "checklist": {
      const items = b.items ?? [];
      return `<div class="bloc checklist"><div class="encadre-titre">${echapper(b.titre ?? "J’ai fini quand…")}</div>${items.map((i) => `<div><span class="case">☐</span> ${txt(i, p)}</div>`).join("")}</div>`;
    }
    case "zone_reponse": return zoneHtml(b, p);
    case "saut_page": return `<div class="saut-page"></div>`;
    case "exemple": return `<div class="bloc exemple"><b>Exemple — </b>${txt(t, p)}</div>`;
    case "schema": return `<div class="bloc schema">🖼 ${txt(t, p)}</div>`;
    case "exercice": return `<div class="bloc exercice"><b>Exercice — </b>${txt(t, p)}</div>`;
    default: return t ? `<div class="bloc">${txt(t, p)}</div>` : "";
  }
}

export function cssRendu(p) {
  return `
.rendu{font-family:${p.police};font-size:${p.taille}pt;line-height:${p.interligne};background:${p.fond};color:${p.couleurTexte};padding:${p.aere ? "2.5cm" : "1.5cm"};text-align:left;hyphens:none;${p.aere ? "letter-spacing:.02em;word-spacing:.08em;" : ""}}
.rendu h1{font-size:${p.taille + 4}pt;margin:0 0 .4em}.rendu h2{font-size:${p.taille + 2}pt;margin:1.2em 0 .5em}
.rendu .bloc{margin:${p.aere ? "0.9em" : "0.5em"} 0}
.rendu .entete{display:flex;justify-content:space-between;font-size:${Math.max(p.taille - 3, 10)}pt;opacity:.75;border-bottom:1px solid #ccc;margin-bottom:.8em}
.rendu .document{border:1px solid #bbb;padding:.6em .8em;border-radius:4px;background:rgba(255,255,255,.45)}
.rendu .doc-titre{font-weight:bold;margin-bottom:.3em}
.rendu .ligne{display:flex;gap:.8em}.rendu .ligne .num{min-width:2.2em;text-align:right;opacity:.6;font-size:.8em}
.rendu .question{font-weight:normal}.rendu .points{float:right;font-size:.85em;opacity:.8;margin-left:1em}
.rendu .repere-consigne{border-left:5px solid #2F6FB0;padding-left:.6em}
.rendu .repere-question{border-left:5px solid #C26A12;padding-left:.6em}
.rendu .picto{margin-right:.4em}
.rendu .zone .ligne-ecriture{border-bottom:1px dotted #777;height:${p.grandesZones ? "1.5cm" : "1cm"}}
.rendu .qcm .choix{margin:.3em 0 .3em 1em}.rendu .case{font-size:1.1em}
.rendu .trou{display:inline-block;min-width:6em;border-bottom:1px solid #333;margin:0 .2em}
.rendu .banque span{display:inline-block;border:1px solid #999;border-radius:4px;padding:0 .4em;margin:.15em}
.rendu .trame .suite{display:inline-block;width:60%;border-bottom:1px dotted #777}
.rendu .encadre,.rendu .checklist{border:2px solid #2F6FB0;border-radius:6px;padding:.5em .8em;background:rgba(47,111,176,.06)}
.rendu .definition{border-color:#6B4FA0;background:rgba(107,79,160,.07)}.rendu .a_retenir{border-color:#2E7D4F;background:rgba(46,125,79,.07)}
.rendu .encadre-titre{font-weight:bold;margin-bottom:.2em}
.rendu table{border-collapse:collapse;width:100%}.rendu th,.rendu td{border:1px solid #888;padding:.25em .5em;vertical-align:top}
.rendu table.zebre tr:nth-child(even) td{background:rgba(0,0,0,.05)}.rendu td.num{opacity:.6;font-size:.8em;width:2em}
.rendu .plan{border:1px solid #aaa;border-radius:6px;padding:.4em .8em;margin-bottom:1em}
.rendu .saut-page{break-after:page;page-break-after:always;height:0}
.rendu section{${p.saut ? "break-after:page;page-break-after:always;" : ""}}
.rendu section:last-child{break-after:auto;page-break-after:auto}
@media print{.rendu{padding:0}@page{size:A4;margin:${p.aere ? "2.5cm" : "1.8cm"}}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:${p.fond}}}`;
}

/** HTML complet d'une version (sans <html>), prêt à afficher, imprimer ou exporter. */
export function rendreHtml(contenu, p, options = {}) {
  const c = normaliser(contenu);
  const n = c.sections.length;
  const plan = p.plan && n > 1
    ? `<div class="plan"><b>Plan</b><ol>${c.sections.map((s) => `<li>${echapper(s.titre ?? s.id)}</li>`).join("")}</ol></div>` : "";
  const duree = c.duree_minutes ? `<span>Durée : ${echapper(c.duree_minutes)} min</span>` : "";
  const ident = options.identifiant ? `<span>${echapper(options.identifiant)}</span>` : "";
  const sections = c.sections.map((s, i) => {
    const prog = p.progression && n > 1 ? `<div class="entete"><span>Partie ${i + 1} sur ${n}</span>${s.duree_minutes && p.minuteur ? `<span>⏱ ${echapper(s.duree_minutes)} min conseillées</span>` : ""}</div>` : "";
    return `<section data-index="${i}">${prog}${s.titre ? `<h2>${txt(s.titre, p)}</h2>` : ""}${(s.blocs ?? []).map((b) => blocHtml(b, p)).join("")}</section>`;
  }).join("");
  return `<div class="rendu"><div class="entete">${ident}${duree}<span>Nom : ……………………</span></div><h1>${txt(c.titre, p)}</h1>${plan}${sections}</div>`;
}

/** Page HTML autonome, avec lecture vocale, règle de lecture et mode pas à pas si le profil le prévoit. */
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
<style>body{margin:0;background:${p.fond}}.outils{position:sticky;top:0;background:#fff;border-bottom:1px solid #ccc;padding:.5em;display:flex;gap:.5em;flex-wrap:wrap;z-index:5;font-family:Arial}
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

/** Durée majorée d'un tiers-temps, arrondie à la minute. */
export function tiersTemps(min) {
  if (!min) return null;
  const t = Math.round(Number(min) * 4 / 3);
  const h = Math.floor(t / 60), m = t % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

// ---------------------------------------------------------------------
//  Export Word (bibliothèque docx chargée à la demande)
// ---------------------------------------------------------------------
export function docxDepuisContenu(docx, contenu, p, options = {}) {
  const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak, ShadingType } = docx;
  const c = normaliser(contenu);
  const police = p.police.split(",")[0].replace(/'/g, "").trim();
  const taille = Math.round(p.taille * 2); // demi-points
  const interligne = Math.round(p.interligne * 240);
  const espace = p.aere ? 200 : 120;
  const clean = (t) => String(t ?? "").replace(/\*\*/g, "");
  // **gras** de l'IA conservé en gras dans Word
  const morceaux = (l, extra) => l.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((m) => m.startsWith("**")
    ? new TextRun({ text: m.slice(2, -2), font: police, size: taille, ...extra, bold: true })
    : new TextRun({ text: m, font: police, size: taille, ...extra }));
  const runs = (t, extra = {}) => {
    const s = p.nombres ? nombresLisibles(String(t ?? "")) : String(t ?? "");
    return s.split("\n").flatMap((l, i) => i === 0 ? morceaux(l, extra) : [new TextRun({ break: 1 }), ...morceaux(l, extra)]);
  };
  const para = (t, opts = {}, extra = {}) => new Paragraph({ children: runs(t, extra), spacing: { line: interligne, after: espace }, ...opts });
  const bordGauche = (couleur) => ({ left: { style: BorderStyle.SINGLE, size: 24, color: couleur, space: 8 } });
  const ligneEcriture = () => new Paragraph({
    children: [new TextRun({ text: " ", size: taille })],
    spacing: { line: p.grandesZones ? 720 : 480 },
    border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: "777777", space: 1 } },
  });
  const enfants = [];
  enfants.push(para(`${options.identifiant ?? ""}${c.duree_minutes ? `    Durée : ${c.duree_minutes} min` : ""}    Nom : ……………………`, {}, { size: Math.max(taille - 6, 18) }));
  enfants.push(new Paragraph({ children: runs(c.titre, { bold: true, size: taille + 8 }), heading: HeadingLevel.HEADING_1, spacing: { after: 240 } }));
  if (p.plan && c.sections.length > 1) {
    enfants.push(para("Plan", {}, { bold: true }));
    c.sections.forEach((s, i) => enfants.push(para(`${i + 1}. ${s.titre ?? s.id}`)));
  }
  c.sections.forEach((s, si) => {
    if (si > 0 && p.saut) enfants.push(new Paragraph({ children: [new PageBreak()] }));
    if (p.progression && c.sections.length > 1) enfants.push(para(`Partie ${si + 1} sur ${c.sections.length}`, {}, { italics: true, size: Math.max(taille - 4, 18) }));
    if (s.titre) enfants.push(new Paragraph({ children: runs(s.titre, { bold: true, size: taille + 4 }), heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 160 } }));
    for (const b of s.blocs ?? []) {
      const t = texteBloc(b);
      switch (b.type) {
        case "consigne": case "etape":
          enfants.push(para((b.type === "etape" && b.numero ? `${b.numero}) ` : "") + (p.pictos ? picto(t) + " " : "") + t, p.reperes ? { border: bordGauche("2F6FB0") } : {}));
          break;
        case "question":
          enfants.push(para(`${b.numero ? b.numero + ". " : ""}${p.pictos ? picto(t) + " " : ""}${t}${b.points != null ? `   (${b.points} pt${Number(b.points) > 1 ? "s" : ""})` : ""}`, p.reperes ? { border: bordGauche("C26A12") } : {}));
          break;
        case "document": {
          if (b.titre) enfants.push(para(b.titre, {}, { bold: true }));
          String(t).split("\n").forEach((l, i) => {
            const pre = p.paragraphesNum ? `§${i + 1}  ` : (p.lignesNum && (i + 1) % 5 === 0 ? `${i + 1}  ` : (p.lignesNum ? "     " : ""));
            enfants.push(para(pre + l, { indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 8 } } }));
          });
          break;
        }
        case "zone_reponse":
          for (let k = 0; k < Math.max(1, Number(b.lignes ?? 4)); k++) enfants.push(ligneEcriture());
          break;
        case "qcm":
          if (t) enfants.push(para(t));
          (b.propositions ?? b.options ?? []).forEach((o) => enfants.push(para(`☐  ${typeof o === "string" ? o : o.texte ?? ""}`, { indent: { left: 360 } })));
          break;
        case "trous":
          enfants.push(para(String(t).replace(/_{3,}/g, "________________")));
          if ((b.banque_mots ?? []).length) enfants.push(para(`Mots possibles : ${b.banque_mots.join("  •  ")}`, {}, { italics: true }));
          break;
        case "trame":
          (b.debuts ?? b.items ?? (t ? [t] : [])).forEach((d) => enfants.push(para(`${d} ……………………………………………`)));
          break;
        case "checklist":
          enfants.push(para(b.titre ?? "J’ai fini quand…", { shading: { type: ShadingType.CLEAR, fill: "EAF1F8" } }, { bold: true }));
          (b.items ?? []).forEach((i) => enfants.push(para(`☐  ${i}`, { shading: { type: ShadingType.CLEAR, fill: "EAF1F8" } })));
          break;
        case "encadre": case "a_retenir": case "definition": {
          const fill = b.type === "definition" ? "EFEAF6" : b.type === "a_retenir" ? "E8F3EC" : "EAF1F8";
          const titre = b.titre ?? (b.type === "a_retenir" ? "À retenir" : b.type === "definition" ? "Définition" : "");
          if (titre) enfants.push(para(titre, { shading: { type: ShadingType.CLEAR, fill } }, { bold: true }));
          enfants.push(para(t, { shading: { type: ShadingType.CLEAR, fill } }));
          break;
        }
        case "tableau": {
          let lignes = b.lignes ?? [];
          if (b.colonnes) lignes = [b.colonnes, ...lignes];
          if (lignes.length) {
            enfants.push(new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: lignes.map((l, i) => new TableRow({
                tableHeader: i === 0,
                children: (Array.isArray(l) ? l : Object.values(l)).map((cel) => new TableCell({
                  children: [para(cel, {}, i === 0 ? { bold: true } : {})],
                  shading: p.tableaux && i > 0 && i % 2 === 0 ? { type: ShadingType.CLEAR, fill: "EEEEEE" } : undefined,
                })),
              })),
            }));
          }
          break;
        }
        case "saut_page": enfants.push(new Paragraph({ children: [new PageBreak()] })); break;
        default: if (t) enfants.push(para((b.type === "exemple" ? "Exemple — " : "") + t));
      }
    }
  });
  const fond = p.fond.replace("#", "");
  return new Document({
    creator: "Adaptateur PAP",
    title: c.titre,
    ...(fond !== "FFFFFF" ? { background: { color: fond } } : {}),
    styles: { default: { document: { run: { font: police, size: taille } } } },
    sections: [{
      properties: { page: { margin: { top: p.aere ? 1418 : 1021, bottom: p.aere ? 1418 : 1021, left: p.aere ? 1418 : 1021, right: p.aere ? 1418 : 1021 } } },
      children: enfants,
    }],
  });
}
