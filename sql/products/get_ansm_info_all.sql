-- Toutes les fiches ANSM en cache (petite table, ~250 lignes) : préchargée par la
-- page principale pour enrichir le tooltip produit sans fetch au survol.
SELECT
    link,
    statut,
    statut_date,
    date_remise,
    observations,
    cis
FROM public.ansm_info;
