// noinspection JSUnusedLocalSymbols

import express from "express";
import cors from "cors";
import "./library/config.js";
import { dbQuery, loadSqlFile } from "./database/connect_db.js";
import ATCDataManager from "./public/js/fetch_first_atcdata.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.set("views", "./views");
app.set("view engine", "pug");

app.use(express.static("public"));
app.use(cors());

app.get("/", async (req, res) => {
  try {
    await ATCDataManager.fetchAndInitialize(12); // 12 for 12 months as default report time length
    const atcClasses = ATCDataManager.getATCClasses();
    const molecules = ATCDataManager.getMolecules();

    res.render("chart", {
      ATCClasses: atcClasses,
      molecules: molecules,
      selectedAtcClass: "",
    });
  } catch (error) {
    console.error("Error loading home page:", error);
    // Check if it's a database connection error
    if (error.message && error.message.includes("database") && error.message.includes("does not exist")) {
      res.status(500).send(`
        <h1>Database Setup Required</h1>
        <p>The application database has not been set up correctly.</p>
        <h2>Please follow these steps:</h2>
        <ol>
          <li>Create the database: <code>createdb dispomed</code></li>
          <li>Create a .env file with: <code>DATABASE_URL=postgres://localhost:5432/dispomed</code></li>
          <li>Initialize the database schema: <code>npm run init-db</code></li>
        </ol>
        <p>For more details, please refer to the README.md file.</p>
      `);
    } else {
      res.status(500).send("An error occurred while loading the application. Please check the server logs for details.");
    }
  }
});

app.get("/product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    // Fetch the global report date (max calculated_end_date from all incidents)
    const { rows: reportRows } = await dbQuery(loadSqlFile('sql/incidents/get_max_report_date.sql'));
    const globalReportDate = reportRows[0].max_report_date;

    res.render('product', { productId, globalReportDate });
  } catch (error) {
    console.error("Error loading product page:", error);
    // Check if it's a database connection error
    if (error.message && error.message.includes("database") && error.message.includes("does not exist")) {
      res.status(500).send(`
        <h1>Database Setup Required</h1>
        <p>The application database has not been set up correctly.</p>
        <h2>Please follow these steps:</h2>
        <ol>
          <li>Create the database: <code>createdb dispomed</code></li>
          <li>Create a .env file with: <code>DATABASE_URL=postgres://localhost:5432/dispomed</code></li>
          <li>Initialize the database schema: <code>npm run init-db</code></li>
        </ol>
        <p>For more details, please refer to the README.md file.</p>
      `);
    } else {
      res.status(500).send("An error occurred while loading the product page. Please check the server logs for details.");
    }
  }
});

app.get("/api/config", (req, res) => {
  res.json({
    API_BASE_URL: process.env.API_BASE_URL || "http://localhost:3000",
  });
});

app.get("/api/incidents", async (req, res) => {
  const { monthsToShow, product, atcClass, molecule } = req.query;

  try {
    let query = loadSqlFile('sql/incidents/get_incidents.sql');
    const params = [monthsToShow];
    let paramIndex = 2;
    let additionalFilters = '';

    if (product) {
      additionalFilters += ` AND (p.name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex})`;
      params.push(`%${product}%`);
      paramIndex++;
    }

    if (req.query.vaccinesOnly === 'true') {
      additionalFilters += ` AND p.atc_code LIKE 'J07%'`;
    }

    if (atcClass) {
      additionalFilters += ` AND ca.code = $${paramIndex}`;
      params.push(atcClass);
      paramIndex++;
    }

    if (molecule) {
      // Handle comma-separated molecule IDs
      if (molecule.includes(',')) {
        const moleculeIds = molecule.split(',').map(id => id.trim());
        additionalFilters += ` AND m.id = ANY($${paramIndex}::int[])`;
        params.push(moleculeIds);
      } else {
        additionalFilters += ` AND m.id = $${paramIndex}`;
        params.push(molecule);
      }
      paramIndex++;
    }

    // Replace the placeholder with the additional filters
    query = query.replace('/* ADDITIONAL_FILTERS */', additionalFilters);

    const result = await dbQuery(query, ...params);
    const incidents = result.rows;

    // 1. Récupérer tous les codes CIS uniques
    const allCisCodes = [ ...new Set (incidents.flatMap(incident => incident.cis_codes || []))];

    // 2. Aller chercher les noms correspondants dans dbpm.cis_bdpm
    let cisNamesMap = {};
    if (allCisCodes.length > 0) {
      const { rows: cisNamesRows } = await dbQuery(
        loadSqlFile('sql/products/get_cis_names.sql'), [allCisCodes]
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

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
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

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get("/api/incidents/ATCClasses", async (req, res) => {
  const { monthsToShow } = req.query;

  try {
    const query = loadSqlFile('sql/atc_classes/get_atc_classes.sql');
    const result = await dbQuery(query, monthsToShow);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching ATC classes:", error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Product detail API route (by product name)
app.get('/api/product/:productName', async (req, res) => {
  const { productName } = req.params;
  try {
    // 1. Find the product by name
    const productResult = await dbQuery(
      loadSqlFile('sql/products/get_product_by_name.sql'),
      ...[productName.toLowerCase()]
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = productResult.rows[0];

    // 2. Get all incidents for this product (by product_id)
    const incidentsResult = await dbQuery(
      loadSqlFile('sql/incidents/get_incidents_by_product.sql'),
      ...[product.id]
    );

    // 3. Attach incidents to product
    product.incidents = incidentsResult.rows;

    res.json(product);
  } catch (error) {
    console.error('Error fetching product detail:', error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get("/api/incidents/product/:productId", async (req, res) => {
  const { productId } = req.params;

  try {
    const query = loadSqlFile('sql/incidents/get_incidents_by_product_id.sql');
    const params = [productId];

    const result = await dbQuery(query, ...params);
    const incidents = result.rows;

    // 1. Récupérer tous les codes CIS uniques
    const allCisCodes = [ ...new Set (incidents.flatMap(incident => incident.cis_codes || []))];

    // 2. Aller chercher les noms correspondants dans dbpm.cis_bdpm
    let cisNamesMap = {};
    if (allCisCodes.length > 0) {
      const { rows: cisNamesRows } = await dbQuery(
        loadSqlFile('sql/products/get_cis_names.sql'), [allCisCodes]
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

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
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
    const query = loadSqlFile('sql/ema/get_incidents_by_cis.sql');
    const { rows } = await dbQuery(query, [codes]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching EMA incidents:', error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get("/substitutions/:cis_code", async (req, res) => {
  const { cis_code } = req.params;
  // We need to fetch the name for this CIS code to display it.
  try {
    const { rows } = await dbQuery(
      loadSqlFile('sql/products/get_denomination_by_cis.sql'), [cis_code]
    );
    const denomination = rows.length > 0 ? rows[0].denomination_medicament : cis_code;

    res.render('substitutions', { 
      cis_code: cis_code,
      denomination: denomination 
    });
  } catch (error) {
    console.error('Error fetching CIS denomination for substitutions page:', error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).send(`
        <h1>Database Setup Required</h1>
        <p>The application database has not been set up correctly.</p>
        <h2>Please follow these steps:</h2>
        <ol>
          <li>Create the database: <code>createdb dispomed</code></li>
          <li>Create a .env file with: <code>DATABASE_URL=postgres://localhost:5432/dispomed</code></li>
          <li>Initialize the database schema: <code>npm run init-db</code></li>
        </ol>
        <p>For more details, please refer to the README.md file.</p>
      `);
    } else {
      res.status(500).render('error', { message: 'Error loading page' });
    }
  }
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
