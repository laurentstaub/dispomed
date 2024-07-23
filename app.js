import express from "express";
import './library/config.js';
import { dbQuery } from './database/connect_db.js';
const app = express();
const PORT = process.env.PORT;

app.set("view engine", "pug");
app.set("views", "./views");

app.use(express.static("."));

app.get('/api/incidents', async (req, res) => {
  try {
    const result = await dbQuery(`
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
    `);
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
