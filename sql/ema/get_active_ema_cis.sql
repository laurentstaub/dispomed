-- Codes CIS ayant au moins un incident EMA EN COURS (statut Ongoing).
-- Préchargé par la page principale pour afficher le drapeau 🇪🇺 sur les lignes.
SELECT DISTINCT m.cis_code
FROM incidents_ema.cis_mappings m
JOIN incidents_ema.incidents i ON m.incident_id = i.incident_id
WHERE i.status = 'Ongoing';
