import express from "express";
import './library/config.js';
import { dbQuery } from './database/connect_db.js';
const app = express();
const PORT = process.env.PORT;

app.set("view engine", "pug");
app.set("views", "./views");

app.use(express.static("."));

app.get('/api/incidents', async (req, res) => {
  const { product, status, startDate, endDate, sortBy, sortOrder } = req.query;

  try {

    let query = `
      SELECT
        i.id,
        p.name AS product,
        i.status,
        TO_CHAR(i.start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(i.end_date, 'YYYY-MM-DD') AS end_date,
        TO_CHAR(i.mise_a_jour, 'YYYY-MM-DD') AS mise_a_jour_date,
        TO_CHAR(i.date_dernier_rapport, 'YYYY-MM-DD') AS date_dernier_rapport,
        STRING_AGG(DISTINCT m.name, ', ') AS molecules,
        STRING_AGG(DISTINCT ca.code || ' - ' || ca.description, ', ') AS classe_atc
      FROM incidents i
      JOIN produits p ON i.product_id = p.id
      LEFT JOIN produits_molecules pm ON p.id = pm.produit_id
      LEFT JOIN molecules m ON pm.molecule_id = m.id
      LEFT JOIN molecules_classe_atc mca ON m.id = mca.molecule_id
      LEFT JOIN classe_atc ca ON mca.classe_atc_id = ca.id
      WHERE 1=1
    `;

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
      GROUP BY i.id, p.name, i.status, i.start_date, i.end_date, i.mise_a_jour, i.date_dernier_rapport
    `;

    if (sortBy) {
      query += ` ORDER BY ${sortBy} ${sortOrder || 'ASC'}`;
    }

    const result = await dbQuery(query, ...params);
    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/", (req, res) => {
  res.render("chart");
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
