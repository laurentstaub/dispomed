import express from "express";
import cors from "cors";
import "./library/config.js";
import { dbQuery } from "./database/connect_db.js";
import ATCDataManager from "./public/js/fetch_first_atcdata.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.set("views", "./views");
app.set("view engine", "pug");

app.use(express.static("public"));
app.use(cors());

app.get("/", async (req, res) => {
  await ATCDataManager.fetchAndInitialize(12); // 12 for 12 months as default report time length
  const atcClasses = ATCDataManager.getATCClasses();
  const molecules = ATCDataManager.getMolecules();

  res.render("chart", {
    ATCClasses: atcClasses,
    molecules: molecules,
    selectedAtcClass: "",
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    API_BASE_URL: process.env.API_BASE_URL || "http://localhost:3000",
  });
});

app.get("/api/incidents", async (req, res) => {
  const { monthsToShow, product, atcClass, molecule } = req.query;

  try {
    let query = `
      WITH incidents_with_sorting AS (
        SELECT
          i.id,
          p.name AS product,
          p.accented_name AS accented_product,
          i.status,
          TO_CHAR(i.start_date, 'YYYY-MM-DD') AS start_date,
          TO_CHAR(i.end_date, 'YYYY-MM-DD') AS end_date,
          TO_CHAR(i.mise_a_jour, 'YYYY-MM-DD') AS mise_a_jour,
          TO_CHAR(i.date_dernier_rapport, 'YYYY-MM-DD') AS date_dernier_rapport,
          TO_CHAR(i.calculated_end_date, 'YYYY-MM-DD') AS calculated_end_date,
          STRING_AGG(DISTINCT m.name, ', ') AS molecule,
          STRING_AGG(DISTINCT m.id::text, ', ') AS molecule_id,
          ca.code || ' - ' || ca.description AS classe_atc,
          ca.code AS atc_code,
          CASE
            WHEN i.calculated_end_date = (SELECT MAX(calculated_end_date) FROM incidents)
              AND i.end_date IS NULL THEN 1
            ELSE 0
          END AS is_active,
          CASE
            WHEN i.status = 'Rupture' THEN 1
            WHEN i.status = 'Tension' THEN 2
            ELSE 3
          END AS status_priority,
          -- Recent change detection - highest priority for recent changes
          CASE
            -- Recent start (within the last 7 days)
            WHEN i.start_date >= ((SELECT MAX(calculated_end_date) FROM incidents) - INTERVAL '7 days') THEN 1
            -- Recent end (within the last 7 days) - using end_date for completed incidents
            WHEN i.end_date IS NOT NULL
                 AND i.end_date >= ((SELECT MAX(calculated_end_date) FROM incidents) - INTERVAL '7 days') THEN 2
            -- Not a recent change
            ELSE 3
          END AS recent_change_priority,
          -- For sorting by recency within recent changes
          CASE
            -- For recent starts, use start_date
            WHEN i.start_date >= ((SELECT MAX(calculated_end_date) FROM incidents) - INTERVAL '7 days') THEN i.start_date
            -- For recent ends, use end_date
            WHEN i.end_date IS NOT NULL
                 AND i.end_date >= ((SELECT MAX(calculated_end_date) FROM incidents) - INTERVAL '7 days') THEN i.end_date
            -- Default to a date far in the past for non-recent changes
            ELSE '1900-01-01'::date
          END AS recent_change_date
        FROM incidents i
        JOIN produits p ON i.product_id = p.id
        LEFT JOIN produits_molecules pm ON p.id = pm.produit_id
        LEFT JOIN molecules m ON pm.molecule_id = m.id
        LEFT JOIN classe_atc ca ON p.classe_atc_id = ca.id
        WHERE i.calculated_end_date >= ((SELECT MAX(calculated_end_date) FROM incidents) - INTERVAL '1 month' * $1)
    `;

    const params = [monthsToShow];
    let paramIndex = 2;

    if (product) {
      query += ` AND (p.name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex})`;
      params.push(`%${product}%`);
      paramIndex++;
    }

    if (atcClass) {
      query += ` AND ca.code = $${paramIndex}`;
      params.push(atcClass);
      paramIndex++;
    }

    if (molecule) {
      query += ` AND m.id = $${paramIndex}`;
      params.push(molecule);
      paramIndex++;
    }

    query += `
        GROUP BY
          i.id,
          p.name,
          p.accented_name,
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
        recent_change_priority ASC,               -- Recent changes first
        recent_change_date DESC,                  -- Most recent changes at the top
        is_active DESC,                           -- Then active incidents
        status_priority ASC,                      -- Then by status (Rupture, Tension, others)
        product ASC                               -- Finally alphabetically by product name
    `;

    const result = await dbQuery(query, ...params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching incidents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/incidents/ATCClasses", async (req, res) => {
  const { monthsToShow } = req.query;

  try {
    let query = `
      WITH maxDate AS (
          SELECT MAX(calculated_end_date) AS max_end_date
          FROM incidents
      )
      SELECT DISTINCT
          ca.code AS atc_code,
          ca.description AS atc_description,
          m.id AS molecule_id,
          m.name AS molecule_name
      FROM incidents i
      CROSS JOIN maxDate
      JOIN produits p ON i.product_id = p.id
      LEFT JOIN produits_molecules pm ON p.id = pm.produit_id
      LEFT JOIN molecules m ON pm.molecule_id = m.id
      LEFT JOIN classe_atc ca ON p.classe_atc_id = ca.id
      WHERE i.calculated_end_date >= (maxDate.max_end_date - INTERVAL '${monthsToShow} months')
          AND ca.code IS NOT NULL
      ORDER BY ca.code, m.name;

     `;

    const result = await dbQuery(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching incidents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
