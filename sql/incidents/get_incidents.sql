WITH max_date AS (
    SELECT MAX(calculated_end_date) AS max_date FROM incidents
),
incidents_with_sorting AS (
    SELECT
        i.id,
        p.id AS product_id,
        p.name AS product,
        p.accented_name AS accented_product,
        p.cis_codes,
        i.status,
        TO_CHAR(i.start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(i.end_date, 'YYYY-MM-DD') AS end_date,
        TO_CHAR(i.mise_a_jour, 'YYYY-MM-DD') AS mise_a_jour,
        TO_CHAR(i.date_dernier_rapport, 'YYYY-MM-DD') AS date_dernier_rapport,
        TO_CHAR(i.calculated_end_date, 'YYYY-MM-DD') AS calculated_end_date,
        STRING_AGG(DISTINCT m.name, ', ') AS molecule,
        STRING_AGG(DISTINCT m.id::text, ', ') AS molecule_id,
        ca.code || ' - ' || ca.description AS classe_atc,
        p.atc_code AS atc_code,
        CASE
            -- Un incident est actif s'il est en Arret sans end_date
            WHEN i.status = 'Arret' AND i.end_date IS NULL THEN 1
            -- Ou s'il est en rupture/tension et actif à la date de rapport
            WHEN i.status IN ('Rupture', 'Tension')
                AND i.start_date <= md.max_date
                AND i.calculated_end_date >= md.max_date
                AND i.end_date IS NULL THEN 1
            ELSE 0
        END AS is_active,
        CASE
            -- Priorités de statut pour incidents actifs: Rupture > Tension > Arret > Disponible
            WHEN i.status = 'Rupture'
                AND i.start_date <= md.max_date
                AND i.calculated_end_date >= md.max_date
                AND i.end_date IS NULL THEN 1
            WHEN i.status = 'Tension'
                AND i.start_date <= md.max_date
                AND i.calculated_end_date >= md.max_date
                AND i.end_date IS NULL THEN 2
            WHEN i.status = 'Arret' AND i.end_date IS NULL THEN 3
            ELSE 4 -- Disponible ou statut inactif
        END AS status_priority,
        -- Recent change detection - highest priority for recent changes
        CASE
            -- Recent start (within the last 7 days)
            WHEN i.start_date >= (md.max_date - INTERVAL '7 days') THEN 1
            -- Recent end (within the last 7 days) - using end_date for completed incidents
            WHEN i.end_date IS NOT NULL
                 AND i.end_date >= (md.max_date - INTERVAL '7 days') THEN 2
            -- Not a recent change
            ELSE 3
        END AS recent_change_priority,
        -- For sorting by recency within recent changes
        CASE
            -- For recent starts, use start_date
            WHEN i.start_date >= (md.max_date - INTERVAL '7 days') THEN i.start_date
            -- For recent ends, use end_date
            WHEN i.end_date IS NOT NULL
                 AND i.end_date >= (md.max_date - INTERVAL '7 days') THEN i.end_date
            -- Default to a date far in the past for non-recent changes
            ELSE '1900-01-01'::date
        END AS recent_change_date
    FROM incidents i
    CROSS JOIN max_date md
    JOIN produits p ON i.product_id = p.id
    LEFT JOIN produits_molecules pm ON p.id = pm.produit_id
    LEFT JOIN molecules m ON pm.molecule_id = m.id
    LEFT JOIN classe_atc ca ON p.classe_atc_id = ca.id
    WHERE i.calculated_end_date >= (md.max_date - INTERVAL '1 month' * $1)
    /* ADDITIONAL_FILTERS */
    GROUP BY
      i.id,
      p.id,
      p.name,
      p.accented_name,
      p.cis_codes,
      i.status,
      i.start_date,
      i.end_date,
      i.mise_a_jour,
      i.date_dernier_rapport,
      i.calculated_end_date,
      ca.code,
      ca.description,
      md.max_date
)
SELECT * FROM incidents_with_sorting
ORDER BY
  recent_change_priority ASC,               -- Recent changes first
  recent_change_date DESC,                  -- Most recent changes at the top
  is_active DESC,                           -- Then active incidents
  status_priority ASC,                      -- Then by status (Rupture, Tension, others)
  product ASC                               -- Finally alphabetically by product name
