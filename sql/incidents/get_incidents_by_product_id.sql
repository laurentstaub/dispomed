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
        p.atc_code AS atc_code
    FROM incidents i
    JOIN produits p ON i.product_id = p.id
    LEFT JOIN produits_molecules pm ON p.id = pm.produit_id
    LEFT JOIN molecules m ON pm.molecule_id = m.id
    LEFT JOIN classe_atc ca ON p.classe_atc_id = ca.id
    WHERE p.id = $1
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
      ca.description
)
SELECT * FROM incidents_with_sorting
ORDER BY
  start_date ASC