SELECT DISTINCT 
  i.incident_id, 
  i.title, 
  i.first_published, 
  i.expected_resolution, 
  i.status,
  ft.*
FROM incidents_ema.cis_mappings m
JOIN incidents_ema.incidents i ON m.incident_id = i.incident_id
LEFT JOIN incidents_ema.french_translations ft ON i.incident_id = ft.incident_id
WHERE m.cis_code = ANY($1)