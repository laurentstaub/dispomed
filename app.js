import express from "express";
import cors from 'cors';
import './library/config.js';
import { dbQuery } from './database/connect_db.js';
import ATCDataManager from "./src/atc_data_manager.js";
import { configManager } from "./src/draw_config.js";

const app = express();
const PORT = process.env.PORT;

app.set("view engine", "pug");
app.set("views", "./views");

app.use(express.static("."));
app.use(cors());

app.get("/", async (req, res) => {
  await ATCDataManager.fetchAndInitialize(12); // 12 for 12 months as default report time length
  const atcClasses = ATCDataManager.getATCClasses();
  const selectedAtcClass = req.query.atcClass || "";
  const molecules = ATCDataManager.getMolecules(selectedAtcClass || "");
  console.log('Molecules from get', molecules);
  res.render("chart", { ATCClasses: atcClasses, molecules: molecules, selectedAtcClass: selectedAtcClass });
});

app.get('/api/incidents', async (req, res) => {
  const { product, monthsToShow, atcClass } = req.query;

  try {
    let query = `
        WITH incidents_with_sorting AS (
          SELECT
            i.id,
            p.name AS product,
            i.status,
            TO_CHAR(i.start_date, 'YYYY-MM-DD') AS start_date,
            TO_CHAR(i.end_date, 'YYYY-MM-DD') AS end_date,
            TO_CHAR(i.mise_a_jour, 'YYYY-MM-DD') AS mise_a_jour,
            TO_CHAR(i.date_dernier_rapport, 'YYYY-MM-DD') AS date_dernier_rapport,
            TO_CHAR(i.calculated_end_date, 'YYYY-MM-DD') AS calculated_end_date,
            STRING_AGG(DISTINCT m.name, ', ') AS molecule,
            STRING_AGG(DISTINCT m.id::text, ', ') AS molecule_id,
            STRING_AGG(DISTINCT ca.code || ' - ' || ca.description, ', ') AS classe_atc,
            STRING_AGG(DISTINCT ca.code, ', ') AS atc_code,
            CASE
              WHEN i.calculated_end_date = (SELECT MAX(calculated_end_date) FROM incidents) THEN 1
              ELSE 0
            END AS is_active,
            CASE
              WHEN i.status = 'Rupture' THEN 1
              WHEN i.status = 'Tension' THEN 2
              ELSE 3
            END AS status_priority
          FROM incidents i
          JOIN produits p ON i.product_id = p.id
          LEFT JOIN produits_molecules pm ON p.id = pm.produit_id
          LEFT JOIN molecules m ON pm.molecule_id = m.id
          LEFT JOIN molecules_classe_atc mca ON m.id = mca.molecule_id
          LEFT JOIN classe_atc ca ON mca.classe_atc_id = ca.id
          WHERE i.calculated_end_date >= ((SELECT MAX(calculated_end_date) FROM incidents) - INTERVAL '1 month' * $1)`;

        const params = [monthsToShow];
        let paramsCounter = 1;

        if (product) {
          paramsCounter += 1;
          query += ` AND p.name ILIKE $${paramsCounter}`;
          params.push(`%${product}%`);
        }

        if (atcClass) {
          paramsCounter += 1;
          query += ` AND ca.code = $${paramsCounter}`;
          params.push(atcClass);
        }

        query += `
          GROUP BY i.id, p.name, i.status, i.start_date, i.end_date, i.mise_a_jour, i.date_dernier_rapport, i.calculated_end_date
        )
        SELECT * FROM incidents_with_sorting
        ORDER BY is_active DESC, status_priority ASC, start_date DESC
        `;
    const result = await dbQuery(query, ...params);
    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/incidents/ATCClasses', async (req, res) => {
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
      LEFT JOIN molecules_classe_atc mca ON m.id = mca.molecule_id
      LEFT JOIN classe_atc ca ON mca.classe_atc_id = ca.id
      WHERE i.calculated_end_date >= (maxDate.max_end_date - INTERVAL '${monthsToShow} months')
          AND ca.code IS NOT NULL
      ORDER BY ca.code, m.name;
     `;

    const result = await dbQuery(query);
    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
