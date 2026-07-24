-- Détail des fiches ANSM (pages « disponibilité ») pour une liste de codes CIS.
-- La table public.ansm_info est un cache rechargé par
-- incident_scraper/src/scripts/05_fetch_ansm_details.js (source : fichier ruptures
-- BDPM CIS_CIP_Dispo_Spec.txt + fetch des fiches ansm.sante.fr).
SELECT
    link,
    title,
    statut,
    statut_date,
    publie_le,
    date_debut,
    date_maj,
    date_remise,
    sections,
    observations,
    cis
FROM public.ansm_info
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(cis) AS c(code)
    WHERE c.code = ANY($1)
)
ORDER BY statut_date DESC NULLS LAST;
