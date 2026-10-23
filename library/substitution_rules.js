/**
 * substitution_rules.js — classification des alternatives, en règles explicites.
 *
 * Remplace le score continu de substitution.equivalences_therapeutiques, qui
 * projetait sur une seule dimension une décision qui est catégorielle : à
 * l'officine il n'existe pas de « substituable à 0,72 ». Soit la substitution
 * est de droit, soit elle suppose une adaptation, soit elle demande le
 * prescripteur, soit elle est impossible — et dans ce dernier cas, dire POURQUOI
 * vaut mieux que de taire le candidat.
 *
 * Ce module ne fait aucun accès base : entrées simples, sorties simples, donc
 * testable sans fixture. La disponibilité est ajoutée en amont par l'appelant.
 */

/** Catégories, dans l'ordre d'utilité au comptoir. L'ACTION est l'en-tête. */
export const CATEGORIES = {
  SUBSTITUABLE: {
    rang: 1,
    action: 'Délivrer un générique du groupe',
    detail: 'Substitution de droit, sauf mention « non substituable »',
  },
  AUTRE_PRESENTATION: {
    rang: 2,
    action: 'Adapter le nombre d\'unités',
    detail: 'Accord du prescripteur éventuel',
  },
  ALTERNATIVE_CLASSE: {
    rang: 3,
    action: 'Appeler le prescripteur',
    detail: 'Autre molécule de la même classe thérapeutique',
  },
  BLOQUE: {
    rang: 4,
    action: 'Ne pas substituer',
    detail: 'Raison indiquée pour chaque ligne',
  },
};

/**
 * Molécules à marge thérapeutique étroite : une variation d'exposition modifie
 * l'effet ou la toxicité. On ne propose JAMAIS de changer de présentation, même
 * à molécule identique. Liste amendable — c'est un choix clinique, pas technique.
 */
export const MARGE_ETROITE = [
  'levothyroxine', 'liothyronine',
  'ciclosporine', 'tacrolimus', 'sirolimus', 'everolimus', 'mycophenolate',
  'warfarine', 'fluindione', 'acenocoumarol',
  'digoxine', 'lithium', 'theophylline',
];

/**
 * Classes ATC entièrement couvertes par la règle de marge étroite. Plus sûr et
 * plus simple à tenir qu'une liste de molécules : N03 couvre tous les
 * antiépileptiques, y compris zonisamide, lacosamide ou cénobamate que la liste
 * nominative oubliait.
 */
export const MARGE_ETROITE_ATC = ['N03'];


const sansAccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Libération prolongée ? LP et libération immédiate ne se substituent jamais. */
export function estLP(texte) {
  const t = sansAccent(texte);
  return /\b(lp|l\.p|liberation prolongee|liberation modifiee|retard|chrono|longue duree)\b/.test(t)
    || /\bprolonge/.test(t);
}

/** Voie d'administration ramenée à une famille comparable. */
export function voie(texte) {
  const t = sansAccent(texte);
  if (/intraveineu|intramuscul|sous.?cutan|perfusion|injectable|parenteral/.test(t)) return 'parenterale';
  if (/orale|buvable|sublingual|orodispers|comprime|gelule|capsule|sirop|granule/.test(t)) return 'orale';
  if (/cutan|transdermi|topique/.test(t)) return 'cutanee';
  if (/ophtalmi|oculaire|collyre|pommade ophtalmique/.test(t)) return 'ophtalmique';
  if (/nasal|inhal|pulmonaire/.test(t)) return 'respiratoire';
  if (/auriculaire|otique/.test(t)) return 'auriculaire';
  if (/rectal|suppositoire/.test(t)) return 'rectale';
  if (/vaginal/.test(t)) return 'vaginale';
  return 'autre';
}

/**
 * Dosage en valeur + unité. « 1,00 mg » -> { valeur: 1, unite: 'mg' }.
 * Les concentrations (« 50 mg/mL ») gardent le numérateur : comparer 50 mg/mL à
 * 100 mg/mL a un sens, comparer 50 mg à 50 mg/mL n'en a pas — d'où le drapeau.
 */
export function dosage(texte) {
  const t = sansAccent(texte).replace(',', '.');
  const m = t.match(/(\d+(?:\.\d+)?)\s*(mg|g|µg|mcg|ug|ui|%|ml)\b/);
  if (!m) return null;
  let valeur = parseFloat(m[1]);
  let unite = m[2] === 'mcg' || m[2] === 'ug' ? 'µg' : m[2];
  if (unite === 'g') { valeur *= 1000; unite = 'mg'; }          // normalisation en mg
  const concentration = /\/\s*\d*\s*(ml|l)\b/.test(t);
  return { valeur, unite, concentration };
}

/** Comprimé sécable ? Seule mention de la BDPM qui autorise à évoquer une fraction. */
export function estSecable(texte) {
  return /s[ée]cable/i.test(texte || '');
}

/**
 * Équivalence entre deux dosages, exprimée en DOSE et non en unités.
 *
 * Le raisonnement pharmaceutique porte sur la dose journalière, pas sur le
 * comprimé : face à un 500 mg en rupture, un 1000 mg n'est pas « une demi-unité »
 * — c'est la même dose quotidienne pour qui en prend deux par jour, sans rien
 * couper. Première version de cette fonction proposait de couper un comprimé
 * d'abiratérone pelliculé : faux cliniquement, et dangereux à manipuler.
 *
 * Une fraction n'est évoquée QUE si la BDPM déclare la forme sécable.
 */
function equivalence(ref, cand, candSecable) {
  if (!ref || !cand || ref.unite !== cand.unite) return null;
  if (ref.concentration !== cand.concentration) return null;
  if (cand.valeur === 0 || ref.valeur === 0) return null;
  if (ref.valeur === cand.valeur) return { texte: 'même dosage', propre: true, rapport: 1 };

  const r = ref.valeur / cand.valeur;          // combien d'unités candidates pour une référence
  const inverse = cand.valeur / ref.valeur;    // combien d'unités de référence dans une candidate

  if (Number.isInteger(r) && r <= 4) {
    return { texte: `${r} unités du ${cand.valeur} ${cand.unite} pour une`, propre: true, rapport: r };
  }
  if (Number.isInteger(inverse) && inverse <= 4) {
    return {
      texte: `${cand.valeur} ${cand.unite} = ${inverse} × ${ref.valeur} ${ref.unite} — adapter selon la dose prescrite`,
      propre: true, rapport: r,
    };
  }
  if (candSecable && Math.abs(r - 0.5) < 1e-9) {
    return { texte: `demi-comprimé (forme sécable)`, propre: true, rapport: r };
  }
  if (r > 0.2 && r < 5) {
    return { texte: `${cand.valeur} ${cand.unite} contre ${ref.valeur} ${ref.unite} — équivalence à vérifier`, propre: false, rapport: r };
  }
  return null;
}

/**
 * Classe un candidat par rapport au produit en rupture.
 *
 * @param {{atc5:string, substances:string[], forme:string, voies:string, dosage:string}} ref
 * @param {{atc5:string, substances:string[], forme:string, voies:string, dosage:string,
 *          code_cis:string, denomination:string, meme_groupe_generique:boolean,
 *          statut:string}} cand
 * @returns {{categorie:string, action:string, detail:string, motif:string, tri:number}}
 */
export function classer(ref, cand) {
  const memeMolecule = (cand.atc5 && ref.atc5 && cand.atc5 === ref.atc5)
    || memeSubstances(ref.substances, cand.substances);

  // 1. Substitution de droit — le fait réglementaire prime sur toute règle calculée.
  if (cand.meme_groupe_generique) {
    return { categorie: 'SUBSTITUABLE', ...CATEGORIES.SUBSTITUABLE, motif: 'Même groupe générique', tri: 0 };
  }

  const vRef = voie(`${ref.voies} ${ref.forme}`);
  const vCand = voie(`${cand.voies} ${cand.forme}`);

  // 2. Blocages — énoncés AVANT les propositions : un candidat écarté doit dire
  //    pourquoi, c'est ce qui fait gagner du temps au comptoir.
  if (memeMolecule && estLP(`${ref.forme} ${ref.denomination || ''}`) !== estLP(`${cand.forme} ${cand.denomination || ''}`)) {
    return bloque('Libération prolongée contre libération immédiate');
  }
  // La marge thérapeutique étroite interdit de changer de PRÉSENTATION d'une même
  // molécule — pas d'envisager une autre molécule, qui relève du prescripteur.
  // Appliquée aux candidats d'une autre molécule, elle masquait 27 lamotrigines
  // qu'un prescripteur aurait pu retenir face à un zonisamide en rupture.
  const mte = MARGE_ETROITE.find(m => (ref.substances || []).some(s => sansAccent(s).includes(m)))
    || (MARGE_ETROITE_ATC.some(p => (ref.atc5 || '').startsWith(p)) ? `classe ${(ref.atc5 || '').slice(0, 3)}` : null);
  if (memeMolecule && mte && !cand.meme_groupe_generique) {
    return bloque(`Marge thérapeutique étroite (${mte}) — changement de présentation exclu`);
  }
  if (vRef !== vCand && vRef !== 'autre' && vCand !== 'autre') {
    return bloque(`Voie différente (${vRef} contre ${vCand})`);
  }

  // 3. Même molécule, autre présentation.
  if (memeMolecule) {
    const eq = equivalence(dosage(ref.dosage), dosage(cand.dosage),
      estSecable(`${cand.forme} ${cand.denomination || ''}`));
    const memeDosage = eq && eq.rapport === 1;
    return {
      categorie: 'AUTRE_PRESENTATION',
      ...CATEGORIES.AUTRE_PRESENTATION,
      motif: memeDosage ? 'Même dosage, autre spécialité'
        : eq ? eq.texte.charAt(0).toUpperCase() + eq.texte.slice(1)
          : 'Dosage non comparable — à vérifier',
      tri: (memeDosage ? 0 : eq?.propre ? 1 : 2) + (cand.forme === ref.forme ? 0 : 0.5),
    };
  }

  // 4. Même classe, autre molécule : décision médicale, pas pharmaceutique.
  // Aucune exception par classe : même pour les dermocorticoïdes, où l'ATC4 code
  // l'activité et où l'échange est courant en pratique, changer de molécule reste
  // une décision du prescripteur. Une règle unique est plus sûre qu'un catalogue
  // d'exceptions que personne ne tiendra à jour.
  const atc4 = a => (a || '').slice(0, 5);
  if (atc4(ref.atc5) && atc4(ref.atc5) === atc4(cand.atc5)) {
    return { categorie: 'ALTERNATIVE_CLASSE', ...CATEGORIES.ALTERNATIVE_CLASSE,
      motif: `Même sous-classe ATC (${atc4(ref.atc5)})`, tri: 0 };
  }
  return null;   // hors périmètre : on ne propose rien
}

function bloque(motif) {
  return { categorie: 'BLOQUE', ...CATEGORIES.BLOQUE, motif, tri: 0 };
}

function memeSubstances(a = [], b = []) {
  if (!a.length || !b.length) return false;
  const na = a.map(sansAccent).map(s => s.replace(/\(.*?\)/g, '').trim()).sort();
  const nb = b.map(sansAccent).map(s => s.replace(/\(.*?\)/g, '').trim()).sort();
  if (na.length !== nb.length) return false;
  return na.every((s, i) => s === nb[i] || s.includes(nb[i]) || nb[i].includes(s));
}
