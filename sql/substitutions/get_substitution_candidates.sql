-- Candidats à la substitution pour un produit, AVANT classification.
--
-- Cette requête ne décide rien : elle rassemble les spécialités plausibles et
-- les attributs nécessaires au moteur de règles (library/substitution_rules.js).
-- Le classement — substituable, autre présentation, alternative de classe,
-- bloqué — se fait en JavaScript, où il est testable sans base.
--
-- Périmètre des candidats : même sous-classe ATC4 que le produit, AMM active et
-- commercialisés. L'ATC du produit vient de ref.cis_atc_mapping (référence CNAM)
-- et, à défaut, de produits.atc_code saisi à la main — 38 % des CIS n'ont pas
-- d'ATC du CNAM, par construction (jamais remboursés en ville).
--
-- La disponibilité suit la même cascade que la carte « Substituts officiels » :
-- fichier officiel des ruptures d'abord, nos incidents ensuite, fiche ANSM en
-- repli, « Aucun signalement » à défaut — qui ne vaut pas garantie de stock.
--
-- $1 = produits.id

WITH md AS (
  SELECT MAX(calculated_end_date) AS d FROM incidents
),
moi AS (
  SELECT p.id, p.atc_code,
         ARRAY(SELECT jsonb_array_elements_text(p.cis_codes)) AS cis
  FROM produits p
  WHERE p.id = $1
),
-- ATC du produit : référence CNAM sur l'un de ses CIS, sinon saisie manuelle.
mon_atc AS (
  SELECT COALESCE(
    (SELECT r.atc_code FROM ref.cis_atc_mapping r, moi WHERE r.code_cis = ANY(moi.cis) LIMIT 1),
    (SELECT atc_code FROM moi)
  ) AS atc5
),
-- Groupes génériques du produit : la substitution de droit prime sur le reste.
mes_groupes AS (
  SELECT DISTINCT g.identifiant_groupe_generique AS gid
  FROM dbpm.cis_gener_bdpm g, moi
  WHERE g.code_cis = ANY(moi.cis)
),
-- Attributs du produit de référence, pour la comparaison.
reference AS (
  SELECT (SELECT atc5 FROM mon_atc) AS atc5,
         c.denomination_medicament AS denomination,
         c.forme_pharmaceutique    AS forme,
         c.voies_administration    AS voies,
         (SELECT string_agg(DISTINCT co.denomination_substance, ' + ')
            FROM dbpm.cis_compo_bdpm co
           WHERE co.code_cis = c.code_cis AND co.nature_composant = 'SA') AS substances,
         (SELECT string_agg(DISTINCT co.dosage_substance, ' + ')
            FROM dbpm.cis_compo_bdpm co
           WHERE co.code_cis = c.code_cis AND co.nature_composant = 'SA') AS dosage
  FROM dbpm.cis_bdpm c, moi
  WHERE c.code_cis = ANY(moi.cis)
  ORDER BY c.code_cis
  LIMIT 1
),
-- Candidats : même ATC4, commercialisés, AMM active, hors CIS du produit.
candidats AS (
  SELECT DISTINCT c.code_cis
  FROM ref.cis_atc_mapping r
  JOIN dbpm.cis_bdpm c ON c.code_cis = r.code_cis
  WHERE left(r.atc_code, 5) = left((SELECT atc5 FROM mon_atc), 5)
    AND (SELECT atc5 FROM mon_atc) IS NOT NULL
    AND c.statut_administratif_amm ILIKE 'Autorisation active%'
    AND c.etat_commercialisation ILIKE 'Commercialis%'
    -- EXISTS, jamais « = ANY((SELECT …)) » : sous cette forme Postgres lit
    -- ANY(sous-requête) et compare le CIS au tableau entier (varchar = text[]).
    AND NOT EXISTS (SELECT 1 FROM moi WHERE c.code_cis = ANY(moi.cis))
)
SELECT
  (SELECT atc5 FROM mon_atc)                       AS ref_atc5,
  (SELECT denomination FROM reference)             AS ref_denomination,
  (SELECT forme FROM reference)                    AS ref_forme,
  (SELECT voies FROM reference)                    AS ref_voies,
  (SELECT substances FROM reference)               AS ref_substances,
  (SELECT dosage FROM reference)                   AS ref_dosage,
  c.code_cis,
  c.denomination_medicament                        AS denomination,
  c.forme_pharmaceutique                           AS forme,
  c.voies_administration                           AS voies,
  c.titulaires                                     AS titulaires,
  r.atc_code                                       AS atc5,
  (SELECT string_agg(DISTINCT co.denomination_substance, ' + ')
     FROM dbpm.cis_compo_bdpm co
    WHERE co.code_cis = c.code_cis AND co.nature_composant = 'SA') AS substances,
  (SELECT string_agg(DISTINCT co.dosage_substance, ' + ')
     FROM dbpm.cis_compo_bdpm co
    WHERE co.code_cis = c.code_cis AND co.nature_composant = 'SA') AS dosage,
  EXISTS (SELECT 1 FROM dbpm.cis_gener_bdpm g
           WHERE g.code_cis = c.code_cis
             AND g.identifiant_groupe_generique IN (SELECT gid FROM mes_groupes)) AS meme_groupe_generique,
  -- statut normalisé, même cascade que get_generic_group_availability.sql
  CASE
    WHEN o.codestatut = '1' THEN 'Rupture'
    WHEN o.codestatut = '2' THEN 'Tension'
    WHEN o.codestatut = '3' THEN 'Arret'
    WHEN s.statut_dispomed IS NOT NULL THEN s.statut_dispomed
    WHEN a.statut ILIKE '%rupture%' THEN 'Rupture'
    WHEN a.statut ILIKE '%tension%' THEN 'Tension'
    WHEN a.statut ILIKE '%arr_t%'   THEN 'Arret'
    ELSE 'Aucun signalement'
  END                                              AS statut,
  s.product_id
FROM candidats cc
JOIN dbpm.cis_bdpm c ON c.code_cis = cc.code_cis
LEFT JOIN ref.cis_atc_mapping r ON r.code_cis = c.code_cis
LEFT JOIN LATERAL (
  SELECT p2.id AS product_id,
         (SELECT i.status FROM incidents i, md
           WHERE i.product_id = p2.id
             AND ((i.status = 'Arret' AND i.end_date IS NULL)
               OR (i.status IN ('Rupture', 'Tension') AND i.end_date IS NULL
                   AND i.start_date <= md.d AND i.calculated_end_date >= md.d))
           ORDER BY i.start_date DESC LIMIT 1) AS statut_dispomed
  FROM produits p2
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(p2.cis_codes) x(v) WHERE x.v = c.code_cis)
  LIMIT 1
) s ON true
LEFT JOIN LATERAL (
  SELECT ai.statut FROM public.ansm_info ai
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(ai.cis) y(v) WHERE y.v = c.code_cis)
  ORDER BY ai.date_maj DESC NULLS LAST LIMIT 1
) a ON true
LEFT JOIN LATERAL (
  SELECT d.codestatut FROM dbpm.cis_cip_dispo_spec d
  WHERE d.code_cis = c.code_cis
  ORDER BY (d.codestatut IN ('1','2','3')) DESC, d.datemiseajour DESC NULLS LAST
  LIMIT 1
) o ON true
ORDER BY c.denomination_medicament;
