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

app.get("/product/:productId", async (req, res) => {
  const { productId } = req.params;
  res.render('product', { productId });
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
              ca.code AS atc_code,
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
    `;

    const params = [monthsToShow];
    let paramIndex = 2;

    if (product) {
      query += ` AND (p.name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex})`;
      params.push(`%${product}%`);
      paramIndex++;
    }

    if (req.query.vaccinesOnly === 'true') {
      query += ` AND p.atc_code LIKE 'J07%'`;
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
    `;

    const result = await dbQuery(query, ...params);
    const incidents = result.rows;

    // 1. Récupérer tous les codes CIS uniques
    const allCisCodes = [ ...new Set (incidents.flatMap(incident => incident.cis_codes || []))];

    // 2. Aller chercher les noms correspondants dans dbpm.cis_bdpm
    let cisNamesMap = {};
    if (allCisCodes.length > 0) {
      const { rows: cisNamesRows } = await dbQuery(
        'SELECT code_cis, denomination_medicament FROM dbpm.cis_bdpm WHERE code_cis = ANY($1)', [allCisCodes]
      );
      cisNamesRows.forEach(row => {
        cisNamesMap[row.code_cis] = row.denomination_medicament;
      });
    }

    // 3. Associer à chaque incident le mapping code_cis -> nom
    incidents.forEach(incident => {
      incident.cis_names = {};
      (incident.cis_codes || []).forEach(code => {
        incident.cis_names[code] = cisNamesMap[code] || '';
      });
    });

    res.json(incidents);
  } catch (error) {
    console.error("Error fetching incidents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/api/substitutions/:code_cis', async (req, res) => {
  const { code_cis } = req.params;

  try {
    const query = `
      SELECT
        s.code_cis_origine,
        s.denomination_origine,
        s.code_cis_cible,
        s.denomination_cible,
        s.score_similarite,
        s.type_equivalence,
        s.raison
      FROM substitution.equivalences_therapeutiques s
      WHERE s.code_cis_origine::TEXT = $1 OR s.code_cis_cible::TEXT = $1
      ORDER BY s.score_similarite DESC;
    `;

    const result = await dbQuery(query, code_cis);
    res.json(result.rows);
  } catch (error) {
    console.error(`Error fetching substitutions for CIS ${code_cis}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/api/incidents/ATCClasses", async (req, res) => {
  const { monthsToShow } = req.query;
  const defaultMonths = 12;

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

// Product detail API route (by product name)
app.get('/api/product/:productName', async (req, res) => {
  const { productName } = req.params;
  try {
    // 1. Find the product by name
    const productResult = await dbQuery(
      `SELECT p.id, p.name, p.accented_name, p.cis_codes
       FROM produits p
       WHERE unaccent(lower(p.name)) = unaccent(lower($1))`,
      ...[productName.toLowerCase()]
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = productResult.rows[0];

    // 2. Get all incidents for this product (by product_id)
    const incidentsResult = await dbQuery(
      `SELECT i.status, i.start_date, i.end_date, i.calculated_end_date, i.mise_a_jour
       FROM incidents i
       WHERE i.product_id = $1
       ORDER BY i.start_date DESC`,
      ...[product.id]
    );

    // 3. Attach incidents to product
    product.incidents = incidentsResult.rows;

    res.json(product);
  } catch (error) {
    console.error('Error fetching product detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/api/incidents/product/:productId", async (req, res) => {
  const { productId } = req.params;

  try {
    let query = `
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
              ca.code AS atc_code
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
    `;

    const params = [productId];

    const result = await dbQuery(query, ...params);
    const incidents = result.rows;

    // 1. Récupérer tous les codes CIS uniques
    const allCisCodes = [ ...new Set (incidents.flatMap(incident => incident.cis_codes || []))];

    // 2. Aller chercher les noms correspondants dans dbpm.cis_bdpm
    let cisNamesMap = {};
    if (allCisCodes.length > 0) {
      const { rows: cisNamesRows } = await dbQuery(
        'SELECT code_cis, denomination_medicament FROM dbpm.cis_bdpm WHERE code_cis = ANY($1)', [allCisCodes]
      );
      cisNamesRows.forEach(row => {
        cisNamesMap[row.code_cis] = row.denomination_medicament;
      });
    }

    // 3. Associer à chaque incident le mapping code_cis -> nom
    incidents.forEach(incident => {
      incident.cis_names = {};
      (incident.cis_codes || []).forEach(code => {
        incident.cis_names[code] = cisNamesMap[code] || '';
      });
    });

    res.json(incidents);
  } catch (error) {
    console.error("Error fetching product incidents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/api/ema-incidents', async (req, res) => {
  const { cis_codes } = req.query;
  if (!cis_codes) {
    return res.status(400).json({ error: 'cis_codes query param required' });
  }
  const codes = cis_codes.split(',').map(code => code.trim());
  try {
    // Find all EMA incidents that have any of the given CIS codes, with details and French translations
    const query = `
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
    `;
    const { rows } = await dbQuery(query, [codes]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching EMA incidents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/substitutions/:cis_code", async (req, res) => {
  const { cis_code } = req.params;
  // We need to fetch the name for this CIS code to display it.
  try {
    const { rows } = await dbQuery(
      'SELECT denomination_medicament FROM dbpm.cis_bdpm WHERE code_cis = $1', [cis_code]
    );
    const denomination = rows.length > 0 ? rows[0].denomination_medicament : cis_code;

    res.render('substitutions', { 
      cis_code: cis_code,
      denomination: denomination 
    });
  } catch (error) {
    console.error('Error fetching CIS denomination for substitutions page:', error);
    res.status(500).render('error', { message: 'Error loading page' });
  }
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
