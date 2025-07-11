-- Create the database schema for dispomed

-- Create classe_atc table
CREATE TABLE IF NOT EXISTS classe_atc (
    id SERIAL PRIMARY KEY,
    code VARCHAR(255) NOT NULL,
    description TEXT
);

-- Create molecules table
CREATE TABLE IF NOT EXISTS molecules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- Create produits table
CREATE TABLE IF NOT EXISTS produits (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    accented_name VARCHAR(255),
    cis_codes TEXT[],
    classe_atc_id INTEGER REFERENCES classe_atc(id),
    atc_code VARCHAR(255)
);

-- Create produits_molecules table (junction table)
CREATE TABLE IF NOT EXISTS produits_molecules (
    produit_id INTEGER REFERENCES produits(id),
    molecule_id INTEGER REFERENCES molecules(id),
    PRIMARY KEY (produit_id, molecule_id)
);

-- Create incidents table
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES produits(id),
    status VARCHAR(50) NOT NULL,
    start_date DATE,
    end_date DATE,
    mise_a_jour DATE,
    date_dernier_rapport DATE,
    calculated_end_date DATE
);

-- Create incidents_ema schema and tables
CREATE SCHEMA IF NOT EXISTS incidents_ema;

CREATE TABLE IF NOT EXISTS incidents_ema.incidents (
    incident_id SERIAL PRIMARY KEY,
    -- Add other columns as needed
    -- These are inferred and may need adjustment
    title TEXT,
    description TEXT,
    status VARCHAR(50),
    start_date DATE,
    end_date DATE
);

CREATE TABLE IF NOT EXISTS incidents_ema.cis_mappings (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER REFERENCES incidents_ema.incidents(incident_id),
    cis_code VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS incidents_ema.french_translations (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER REFERENCES incidents_ema.incidents(incident_id),
    translated_title TEXT,
    translated_description TEXT
);