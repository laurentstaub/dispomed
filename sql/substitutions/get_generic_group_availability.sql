-- Substituts officiels d'un produit : membres du/des groupe(s) générique(s) BDPM
-- auxquels appartiennent ses CIS, avec leur disponibilité du jour.
--
-- Périmètre volontairement restreint au FAIT réglementaire (dbpm.cis_gener_bdpm) :
-- au sein d'un groupe générique, la substitution est de droit. Aucun score
-- algorithmique ici — la similitude thérapeutique reste hors ligne tant qu'elle
-- n'est pas évaluée.
--
-- Disponibilité, par ordre de priorité :
--   1. fichier officiel des ruptures BDPM (dbpm.cis_cip_dispo_spec) — LA liste
--      ANSM par CIS, sur tout le marché : c'est la source de vérité ;
--   2. nos incidents (produit suivi par dispomed) — plus frais que le fichier,
--      qui n'est rafraîchi qu'au snapshot BDPM ;
--   3. fiche ANSM (public.ansm_info) — repli quand le CIS n'est ni dans le
--      fichier ni dans notre périmètre ;
--   4. sinon : « Aucun signalement » — au référentiel officiel, sans ligne de
--      rupture. Ce n'est PAS une garantie de stock chez le grossiste.
--
-- $1 = produits.id

WITH md AS (
  SELECT MAX(calculated_end_date) AS d FROM incidents
),
moi AS (
  SELECT p.id,
         ARRAY(SELECT jsonb_array_elements_text(p.cis_codes)) AS cis
  FROM produits p
  WHERE p.id = $1
),
groupes AS (
  SELECT DISTINCT g.identifiant_groupe_generique AS gid,
                  g.libelle_groupe_generique     AS libelle
  FROM dbpm.cis_gener_bdpm g, moi
  WHERE g.code_cis = ANY(moi.cis)
),
membres AS (
  SELECT DISTINCT ON (g.code_cis)
         g.code_cis,
         gr.gid,
         gr.libelle,
         g.type_generique,
         g.numero_tri,
         c.denomination_medicament,
         c.titulaires,
         c.forme_pharmaceutique,
         c.etat_commercialisation
  FROM dbpm.cis_gener_bdpm g
  JOIN groupes gr ON gr.gid = g.identifiant_groupe_generique
  LEFT JOIN dbpm.cis_bdpm c ON c.code_cis = g.code_cis
  WHERE c.statut_administratif_amm ILIKE 'Autorisation active%'
    AND c.etat_commercialisation ILIKE 'Commercialis%'
  ORDER BY g.code_cis, g.numero_tri
)
SELECT
  m.code_cis,
  m.gid                                   AS groupe_id,
  m.libelle                               AS groupe_libelle,
  m.denomination_medicament,
  m.titulaires,
  m.forme_pharmaceutique,
  -- type_generique BDPM : 0 = princeps, 1/2/4 = générique (ou assimilé)
  (m.type_generique = '0')                AS est_princeps,
  s.product_id,
  s.product_name,
  -- statut normalisé : Rupture / Tension / Arret / Aucun signalement.
  -- Le fichier officiel prime ; ses lignes « remise à disposition » (code 4)
  -- valent absence de signalement, l'incident est clos côté ANSM.
  CASE
    WHEN o.codestatut = '1' THEN 'Rupture'
    WHEN o.codestatut = '2' THEN 'Tension'
    WHEN o.codestatut = '3' THEN 'Arret'
    WHEN s.statut_dispomed IS NOT NULL THEN s.statut_dispomed
    WHEN a.statut ILIKE '%rupture%'    THEN 'Rupture'
    WHEN a.statut ILIKE '%tension%'    THEN 'Tension'
    WHEN a.statut ILIKE '%arr_t%'      THEN 'Arret'
    ELSE 'Aucun signalement'
  END                                     AS statut,
  o.dateremisedispo                       AS date_remise,
  COALESCE(o.lien_vers_la_page_du_site_ansm, a.link) AS lien_ansm,
  -- EXISTS, et non « = ANY((SELECT cis FROM moi)) » : sous cette forme Postgres
  -- lit ANY(sous-requête) et compare le CIS au tableau entier (varchar = text[]).
  EXISTS (SELECT 1 FROM moi WHERE m.code_cis = ANY(moi.cis)) AS est_ce_produit
FROM membres m
LEFT JOIN LATERAL (
  SELECT p2.id AS product_id,
         p2.accented_name AS product_name,
         (SELECT i.status
            FROM incidents i, md
           WHERE i.product_id = p2.id
             AND ((i.status = 'Arret' AND i.end_date IS NULL)
               OR (i.status IN ('Rupture', 'Tension') AND i.end_date IS NULL
                   AND i.start_date <= md.d AND i.calculated_end_date >= md.d))
           ORDER BY i.start_date DESC
           LIMIT 1) AS statut_dispomed
  FROM produits p2
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(p2.cis_codes) x(c)
                 WHERE x.c = m.code_cis)
  LIMIT 1
) s ON true
LEFT JOIN LATERAL (
  SELECT ai.statut, ai.link
  FROM public.ansm_info ai
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(ai.cis) y(c)
                 WHERE y.c = m.code_cis)
  ORDER BY ai.date_maj DESC NULLS LAST
  LIMIT 1
) a ON true
-- fichier officiel des ruptures : ligne la plus récente pour ce CIS
LEFT JOIN LATERAL (
  SELECT d.codestatut, d.dateremisedispo, d.lien_vers_la_page_du_site_ansm
  FROM dbpm.cis_cip_dispo_spec d
  WHERE d.code_cis = m.code_cis
  ORDER BY (d.codestatut IN ('1','2','3')) DESC, d.datemiseajour DESC NULLS LAST
  LIMIT 1
) o ON true
ORDER BY
  -- sans signalement d'abord : ce sont les seules lignes utiles au comptoir
  CASE
    WHEN o.codestatut IN ('1','3') THEN 3
    WHEN o.codestatut = '2' THEN 2
    WHEN s.statut_dispomed IS NOT NULL OR a.statut ILIKE '%rupture%'
      OR a.statut ILIKE '%tension%' OR a.statut ILIKE '%arr_t%' THEN 2
    ELSE 0
  END,
  m.type_generique,
  m.denomination_medicament;
