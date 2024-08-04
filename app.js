import express from "express";
import cors from 'cors';
import './library/config.js';
import { dbQuery } from './database/connect_db.js';
import { fetchATCClasses } from './src/fetch_data.js';


const app = express();
const PORT = process.env.PORT;

app.set("view engine", "pug");
app.set("views", "./views");

app.use(express.static("."));
app.use(cors());

app.get("/", async (req, res) => {
  let ATCClasses = await fetchATCClasses();
  res.render("chart", { ATCClasses: ATCClasses });
});

app.get('/api/incidents', async (req, res) => {
  const { product, status, startDate, endDate } = req.query;


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
    STRING_AGG(DISTINCT m.name, ', ') AS molecules,
    STRING_AGG(DISTINCT ca.code || ' - ' || ca.description, ', ') AS classe_atc,
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
  WHERE i.calculated_end_date >= ((SELECT MAX(calculated_end_date) FROM incidents) - INTERVAL '12 months')`;

     const params = [];

     if (product) {
       query += ` AND p.name ILIKE $${params.length + 1}`;
       params.push(`%${product}%`);
     }

     if (status) {
       query += ` AND i.status = $${params.length + 1}`;
       params.push(status);
     }

     if (startDate) {
       query += ` AND i.start_date >= $${params.length + 1}`;
       params.push(startDate);
     }

     if (endDate) {
       query += ` AND i.end_date >= $${params.length + 1}`;
       params.push(endDate);
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
  const { product, status, startDate, endDate, sortBy, sortOrder } = req.query;

  try {
    let query = `
      WITH maxDate AS (
          SELECT MAX(calculated_end_date) AS max_end_date
          FROM incidents
      )
      SELECT DISTINCT
          ca.code || ' - ' || ca.description AS classe_atc
      FROM incidents i
      CROSS JOIN maxDate
      JOIN produits p ON i.product_id = p.id
      LEFT JOIN produits_molecules pm ON p.id = pm.produit_id
      LEFT JOIN molecules m ON pm.molecule_id = m.id
      LEFT JOIN molecules_classe_atc mca ON m.id = mca.molecule_id
      LEFT JOIN classe_atc ca ON mca.classe_atc_id = ca.id
      WHERE i.calculated_end_date >= (maxDate.max_end_date - INTERVAL '12 months')
        AND i.calculated_end_date <= maxDate.max_end_date
        AND ca.code IS NOT NULL
      ORDER BY classe_atc;
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
