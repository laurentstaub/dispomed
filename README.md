# dispomed — French drug shortage tracker

A web application that tracks medicine availability over time from French health
agency (ANSM) shortage reports, and answers the question a pharmacist actually has
at the counter, in thirty seconds: what is the status, since when, what does the
agency say, and **what can I substitute**.

*(Version française : [README-fr.md](./README-fr.md))*

---

## 1. Scope

This repository holds **the application only**. The data is produced by a companion
repository, `incident_scraper`, which scrapes the ANSM daily and populates the
PostgreSQL database `incidents_json`. dispomed only ever reads from it.

What is covered: shortage and supply-tension reports published by the ANSM — mostly
major therapeutic interest medicines (MITM) and vaccines, about 83 % of tracked
products, but not exclusively. The scope is therefore defined by **the source**,
not by a regulatory list.

What is not covered: medical devices, local shortages never reported to the ANSM,
and actual wholesaler stock levels — which no public source provides.

---

## 2. What the application shows

**Main list.** One row per product with a colour-coded timeline (shortage, tension,
discontinuation, available) over 12 months, 24 months, or the full history since
April 2021. Filters: free-text search, ATC class, molecule, vaccines only, DGS
essential medicines only.

**Row markers.** `H` hospital-only, `V` vaccine, `EU` shortage also tracked at
European level (EMA). Deliberately grey, kept out of the status colour language.

**Hover preview.** A miniature product sheet: ATC/INN breadcrumb, status banner,
available substitutes, ANSM community and hospital situation, announced
resupply date, affected CIS codes.

**Product sheet** (as an overlay from the list, or as a standalone page):

- current status and count of substitutes with no reported shortage;
- affected CIS codes, in an accordion;
- **official substitutes** — other specialities from the same BDPM generic group,
  with their availability today;
- detailed ANSM situation, parsed from the agency's own pages;
- days of availability per year and an availability score;
- sales in number of packs per presentation (Open Medic);
- full incident history as a timeline.

---

## 3. Two design rules that explain many choices

**"No reported shortage" is not "in stock".** A substitute's status is resolved in
cascade: official BDPM shortage file first, our own incidents next, ANSM page as a
fallback, and otherwise "no reported shortage". That last value means nothing has
been declared — not that the wholesaler has stock. The label says so explicitly
rather than implying a guarantee.

**Legal substitution only.** The substitutes card lists only members of the ANSM
generic group register, where substitution is legally permitted. A therapeutic
similarity score does exist in the database
(`substitution.equivalences_therapeutiques`) but is **not displayed**: it has never
been validated, and suggesting an alternative outside the generic group would fall
outside a pharmacist's remit.

---

## 4. Architecture

```
Browser ──► Express (app.js) ──► SQL files (sql/) ──► PostgreSQL incidents_json
   │                                                        │
   └── D3.js (public/js/): list, timelines, overlay         └── fed by incident_scraper
```

| Component | Role |
|-----------|------|
| `app.js` | Express server, one route per question asked of the database |
| `sql/` | **every** query, as `.sql` files — never SQL inline in JS |
| `views/` | Pug templates (`chart`, `product`, `substitutions`, `layout`, errors) |
| `public/js/draw.js` | main list, timelines, hover preview, product overlay |
| `public/js/draw_product_page.js` | product sheet |
| `public/js/00_fetch_data.js`, `01_store_data.js` | API access and client state |
| `public/stylesheets/common.css`, `product.css` | styling (no CSS framework) |
| `database/connect_db.js` | PostgreSQL pool, `dbQuery()`, `loadSqlFile()` |
| `deploy_prod.sh` | database + code deployment to Heroku |

SQL files are re-read on every request: changing a query does not require a server
restart.

### API endpoints

| Route | Purpose |
|-------|---------|
| `/api/incidents` | main list; filters `monthsToShow`, `product`, `atcClass`, `molecule`, `vaccinesOnly`, `essentialsOnly` |
| `/api/incidents/product/:id` | incidents for one product |
| `/api/incidents/ATCClasses` | ATC classes present in the data |
| `/api/search` | product/molecule search, no time window |
| `/api/substitutes/:productId` | official substitutes + availability |
| `/api/substitutes-counts` | counts for all products (preloaded by the list) |
| `/api/ansm-info`, `/api/ansm-info/all` | ANSM pages by CIS |
| `/api/ema-incidents`, `/api/ema-active-cis` | European shortages |
| `/api/sales-by-cis`, `/api/sales-years` | Open Medic sales |

---

## 5. Data read

Database `incidents_json`, schema by schema:

| Schema | Tables read | Contents |
|--------|-------------|----------|
| `public` | `produits`, `incidents`, `molecules`, `produits_molecules`, `classe_atc`, `product_sales`, `ansm_info` | application core |
| `dbpm` | `cis_bdpm`, `cis_gener_bdpm`, `cis_cip_dispo_spec` | BDPM reference: names, generic groups, official shortage file |
| `incidents_ema` | `incidents`, `french_translations`, `cis_mappings` | translated European shortages |
| `substitution` | `equivalences_therapeutiques` | unvalidated score, legacy `/substitutions/:cis` page |

Marker columns on `produits`: `reserve_hospitaliere` (from BDPM prescription
conditions) and `essentiel` (French DGS essential medicines list, matched by ATC).

---

## 6. Running locally

Requirements: Node 20, PostgreSQL 16+, and an `incidents_json` database populated
by `incident_scraper`.

```bash
npm install
echo "DATABASE_URL=postgres://localhost:5432/incidents_json" > .env
npm start          # http://localhost:3000
npm test           # Jest
```

---

## 7. Deployment

```bash
./deploy_prod.sh
```

The script dumps the local database, restores it on Heroku, **verifies the data
actually landed**, then offers to push the code. Every destructive step asks for
confirmation.

**The database always ships before the code.** A query reading a new column assumes
that column already exists in production; a standalone `git push heroku` broke
production twice for exactly that reason.

The dump is deliberately lean — production receives only what the application
queries. Exclusion list and full procedure in `incident_scraper/README.md`.

---

## 8. Sources

- **ANSM** — [medicine availability](https://ansm.sante.fr/disponibilites-des-produits-de-sante/medicaments), scraped daily
- **BDPM** — [French public medicines database](https://base-donnees-publique.medicaments.gouv.fr/), reference data and official shortage file
- **Open Medic / Medic'AM** — French health insurance, community sales and ATC mapping
- **EMA** — [shortages report](https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/medicine-shortages), updated twice daily
- **DGS** — essential medicines list, refreshed every June
