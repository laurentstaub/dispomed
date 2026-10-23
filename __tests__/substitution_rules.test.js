import { classer, estLP, voie, dosage, estSecable, MARGE_ETROITE } from '../library/substitution_rules.js';

const ref = {
  atc5: 'C08CA01', substances: ['Amlodipine (bésilate d\')'],
  forme: 'comprimé', voies: 'orale', dosage: '10 mg', denomination: 'AMLOR 10 mg, gélule',
};
const cand = (p = {}) => ({
  atc5: 'C08CA01', substances: ['Amlodipine (bésilate d\')'],
  forme: 'comprimé', voies: 'orale', dosage: '5 mg',
  code_cis: '12345678', denomination: 'AMLODIPINE 5 mg, comprimé',
  meme_groupe_generique: false, statut: 'Aucun signalement', ...p,
});

describe('lecture des présentations', () => {
  test('reconnaît la libération prolongée sous ses graphies courantes', () => {
    expect(estLP('comprimé LP 400 mg')).toBe(true);
    expect(estLP('comprimé à libération prolongée')).toBe(true);
    expect(estLP('TERALITHE LP 400 mg')).toBe(true);
    expect(estLP('comprimé pelliculé')).toBe(false);
  });

  test('ramène les voies à des familles comparables', () => {
    expect(voie('solution injectable IV')).toBe('parenterale');
    expect(voie('comprimé, voie orale')).toBe('orale');
    expect(voie('collyre')).toBe('ophtalmique');
  });

  test('normalise les dosages et distingue les concentrations', () => {
    expect(dosage('1,00 mg')).toEqual({ valeur: 1, unite: 'mg', concentration: false });
    expect(dosage('1 g')).toEqual({ valeur: 1000, unite: 'mg', concentration: false });
    expect(dosage('50 mg/mL').concentration).toBe(true);
  });
});

describe('classification', () => {
  test('le groupe générique prime sur toute règle calculée', () => {
    const r = classer(ref, cand({ meme_groupe_generique: true, forme: 'solution injectable' }));
    expect(r.categorie).toBe('SUBSTITUABLE');
    expect(r.action).toBe('Délivrer un générique du groupe');
  });

  test('dosage plus faible : nombre d\'unités explicite', () => {
    const r = classer(ref, cand());            // réf 10 mg, candidat 5 mg
    expect(r.categorie).toBe('AUTRE_PRESENTATION');
    expect(r.action).toBe("Adapter le nombre d'unités");
    expect(r.motif).toMatch(/2 unités du 5 mg pour une/);
  });

  test('dosage plus fort : équivalence en DOSE, jamais en fraction de comprimé', () => {
    // Cas réel ABIRATERONE 500 mg face à un 1000 mg pelliculé : couper est faux
    // cliniquement et dangereux. On raisonne sur la dose journalière.
    const abi = { atc5: 'L02BX03', substances: ["Acétate d'abiratérone"], forme: 'comprimé pelliculé', voies: 'orale', dosage: '500 mg' };
    const r = classer(abi, cand({ atc5: 'L02BX03', substances: ["Acétate d'abiratérone"],
      forme: 'comprimé pelliculé', dosage: '1000 mg', denomination: 'ABIRATERONE SANDOZ 1000 mg, comprimé pelliculé' }));
    expect(r.motif).toMatch(/1000 mg = 2 × 500 mg/);
    expect(r.motif).not.toMatch(/demi/i);
  });

  test('la fraction n\'est évoquée que si la BDPM déclare la forme sécable', () => {
    expect(estSecable('comprimé pelliculé')).toBe(false);
    expect(estSecable('comprimé sécable')).toBe(true);
  });

  test('même molécule, même dosage, autre spécialité hors groupe', () => {
    const r = classer(ref, cand({ dosage: '10 mg' }));
    expect(r.motif).toBe('Même dosage, autre spécialité');
  });

  test('LP contre libération immédiate : bloqué, avec le motif', () => {
    const r = classer(ref, cand({ forme: 'comprimé à libération prolongée', dosage: '10 mg' }));
    expect(r.categorie).toBe('BLOQUE');
    expect(r.motif).toMatch(/Libération prolongée/);
  });

  test('la marge étroite ne bloque PAS une autre molécule de la classe', () => {
    // Face à un zonisamide en rupture, la lamotrigine est une option que le
    // prescripteur peut retenir : la contrainte MTE porte sur le changement de
    // présentation d'une même molécule, pas sur le choix d'une autre molécule.
    const zoni = { atc5: 'N03AX15', substances: ['Zonisamide'], forme: 'gélule', voies: 'orale', dosage: '100 mg' };
    const r = classer(zoni, cand({ atc5: 'N03AX09', substances: ['Lamotrigine'],
      forme: 'comprimé', dosage: '100 mg', denomination: 'LAMOTRIGINE 100 mg, comprimé' }));
    expect(r.categorie).toBe('ALTERNATIVE_CLASSE');
  });

  test('marge thérapeutique étroite : jamais de changement de présentation', () => {
    const levo = { atc5: 'H03AA01', substances: ['Lévothyroxine sodique'], forme: 'comprimé', voies: 'orale', dosage: '100 µg' };
    const r = classer(levo, cand({ atc5: 'H03AA01', substances: ['Lévothyroxine sodique'], dosage: '50 µg' }));
    expect(r.categorie).toBe('BLOQUE');
    expect(r.motif).toMatch(/Marge thérapeutique étroite/);
  });

  test('voie différente : bloqué', () => {
    const r = classer(ref, cand({ forme: 'solution injectable', voies: 'intraveineuse', dosage: '10 mg' }));
    expect(r.categorie).toBe('BLOQUE');
    expect(r.motif).toMatch(/Voie différente/);
  });

  test('dermocorticoïdes : autre molécule = prescripteur, sans exception de classe', () => {
    // NERISONE pour DIPROSONE est une substitution courante en pratique, mais
    // elle reste un changement de molécule : décision du prescripteur. Décidé
    // ainsi plutôt que d'entretenir un catalogue d'exceptions par classe.
    const diprosone = { atc5: 'D07AC01', substances: ['Bétaméthasone dipropionate'],
      forme: 'crème', voies: 'cutanée', dosage: '0,05 %' };
    const r = classer(diprosone, cand({ atc5: 'D07AC06', substances: ['Diflucortolone valérate'],
      forme: 'crème', voies: 'cutanée', dosage: '0,1 %', denomination: 'NERISONE 0,1 %, crème' }));
    expect(r.categorie).toBe('ALTERNATIVE_CLASSE');
    expect(r.action).toBe('Appeler le prescripteur');
  });

  test('tous les antiépileptiques sont couverts par la marge étroite, pas seulement les historiques', () => {
    const zoni = { atc5: 'N03AX15', substances: ['Zonisamide'], forme: 'gélule', voies: 'orale', dosage: '100 mg' };
    const r = classer(zoni, cand({ atc5: 'N03AX15', substances: ['Zonisamide'],
      forme: 'gélule', dosage: '50 mg', denomination: 'ZONISAMIDE 50 mg, gélule' }));
    expect(r.categorie).toBe('BLOQUE');
    expect(r.motif).toMatch(/classe N03/);
  });

  test('autre molécule de la même sous-classe : renvoi au prescripteur', () => {
    const r = classer(ref, cand({ atc5: 'C08CA02', substances: ['Félodipine'], dosage: '10 mg' }));
    expect(r.categorie).toBe('ALTERNATIVE_CLASSE');
    expect(r.action).toBe('Appeler le prescripteur');
  });

  test('classe ATC sans rapport : aucune proposition', () => {
    expect(classer(ref, cand({ atc5: 'J01CA04', substances: ['Amoxicilline'] }))).toBeNull();
  });

  test('un rapport de dosage bâtard est signalé comme tel', () => {
    const r = classer(ref, cand({ dosage: '7 mg' }));
    expect(r.motif).toMatch(/équivalence à vérifier/);
  });
});

describe('garde-fous de la liste MTE', () => {
  test('les molécules sont écrites sans accent ni casse pour la comparaison', () => {
    MARGE_ETROITE.forEach(m => expect(m).toBe(m.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')));
  });
});
