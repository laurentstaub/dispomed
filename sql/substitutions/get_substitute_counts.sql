-- Décompte des substituts officiels, pour TOUS les produits d'un coup.
-- Alimente l'aperçu de la liste principale (une requête au chargement, pas une
-- par ligne). Même définition que la fiche produit : membres commercialisés du
-- groupe générique BDPM, hors CIS du produit lui-même.
--
-- Retour : product_id, total, dispo (0 ligne = produit sans groupe générique).

WITH md AS (
  SELECT MAX(calculated_end_date) AS d FROM incidents
),
-- couple (produit, CIS) à plat
pc AS (
  SELECT p.id, x.c AS cis
  FROM produits p, LATERAL jsonb_array_elements_text(p.cis_codes) x(c)
),
-- groupes génériques auxquels appartient chaque produit
grp AS (
  SELECT DISTINCT pc.id, g.identifiant_groupe_generique AS gid
  FROM pc
  JOIN dbpm.cis_gener_bdpm g ON g.code_cis = pc.cis
),
-- membres commercialisés de ces groupes
membres AS (
  SELECT DISTINCT grp.id, g.code_cis
  FROM grp
  JOIN dbpm.cis_gener_bdpm g ON g.identifiant_groupe_generique = grp.gid
  JOIN dbpm.cis_bdpm c        ON c.code_cis = g.code_cis
  WHERE c.statut_administratif_amm ILIKE 'Autorisation active%'
    AND c.etat_commercialisation ILIKE 'Commercialis%'
),
-- un produit n'est pas son propre substitut
autres AS (
  SELECT m.id, m.code_cis
  FROM membres m
  WHERE NOT EXISTS (SELECT 1 FROM pc WHERE pc.id = m.id AND pc.cis = m.code_cis)
),
-- CIS signalés : fichier officiel des ruptures (source de vérité, tout le
-- marché), nos incidents actifs, ou fiche ANSM en cours. Le code 4 du fichier
-- (remise à disposition) ne compte pas : l'incident est clos côté ANSM.
indispo AS (
  SELECT DISTINCT d.code_cis AS cis
  FROM dbpm.cis_cip_dispo_spec d
  WHERE d.codestatut IN ('1', '2', '3')
  UNION
  SELECT DISTINCT x.c AS cis
  FROM incidents i
  JOIN produits p2 ON p2.id = i.product_id
  CROSS JOIN md
  CROSS JOIN LATERAL jsonb_array_elements_text(p2.cis_codes) x(c)
  WHERE (i.status = 'Arret' AND i.end_date IS NULL)
     OR (i.status IN ('Rupture', 'Tension') AND i.end_date IS NULL
         AND i.start_date <= md.d AND i.calculated_end_date >= md.d)
  UNION
  SELECT DISTINCT y.c AS cis
  FROM public.ansm_info ai, LATERAL jsonb_array_elements_text(ai.cis) y(c)
  WHERE ai.statut ILIKE '%rupture%' OR ai.statut ILIKE '%tension%' OR ai.statut ILIKE '%arr_t%'
)
SELECT a.id                                   AS product_id,
       count(*)::int                          AS total,
       count(*) FILTER (WHERE d.cis IS NULL)::int AS dispo   -- sans signalement
FROM autres a
LEFT JOIN indispo d ON d.cis = a.code_cis
GROUP BY a.id;
