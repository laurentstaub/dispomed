import express from "express";
import './library/config.js';
import { dbQuery } from './database/connect_db.js';
const app = express();
const PORT = process.env.PORT;

app.set("view engine", "pug");
app.set("views", "./views");

app.use(express.static("."));

// app.get('/api/incidents', async (req, res) => {
//   try {
//     const result = await dbQuery(`
//       SELECT
//         i.id,
//         p.name as product,
//         i.status,
//         TO_CHAR(i.start_date, 'YYYY-MM-DD') as start_date,
//         TO_CHAR(i.end_date, 'YYYY-MM-DD') as end_date,
//         TO_CHAR(i.mise_a_jour, 'YYYY-MM-DD') as mise_a_jour_date,
//         TO_CHAR(i.date_dernier_rapport, 'YYYY-MM-DD') as date_dernier_rapport
//       FROM incidents i
//       JOIN produits p ON i.product_id = p.id
//     `);
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Error fetching incidents:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

app.get('/api/incidents', async (req, res) => {
  const { product, status, startDate, endDate, sortBy, sortOrder } = req.query;

  try {
    let query = `
      SELECT
        i.id,
        p.name as product,
        i.status,
        TO_CHAR(i.start_date, 'YYYY-MM-DD') as start_date,
        TO_CHAR(i.end_date, 'YYYY-MM-DD') as end_date,
        TO_CHAR(i.mise_a_jour, 'YYYY-MM-DD') as mise_a_jour_date,
        TO_CHAR(i.date_dernier_rapport, 'YYYY-MM-DD') as date_dernier_rapport
      FROM incidents i
      JOIN produits p ON i.product_id = p.id
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
      query += ` AND i.end_date <= $${params.length + 1}`;
      params.push(endDate);
    }

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
