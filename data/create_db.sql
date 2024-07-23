-- Create the database schema
CREATE TABLE norm_produits (
    id SERIAL PRIMARY KEY,
    normalized_name VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE molecules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE classe_atc (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255) NOT NULL
);

CREATE TABLE produits (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    norm_product_id INT REFERENCES norm_produits(id),
    manufacturer VARCHAR(255)
);

CREATE TABLE incidents (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES produits(id),
    status VARCHAR(50),
    start_date DATE,
    end_date DATE,
    mise_a_jour DATE,
    date_dernier_rapport DATE
);

CREATE TABLE produits_molecules (
    produit_id INT REFERENCES produits(id),
    molecule_id INT REFERENCES molecules(id),
    PRIMARY KEY (produit_id, molecule_id)
);

CREATE TABLE molecules_classe_atc (
    molecule_id INT REFERENCES molecules(id),
    classe_atc_id INT REFERENCES classe_atc(id),
    PRIMARY KEY (molecule_id, classe_atc_id)
);

-- Create a temporary table to hold all the data
CREATE TEMPORARY TABLE temp_import (
    normalized_name VARCHAR(255),
    status VARCHAR(50),
    start_date DATE,
    end_date DATE,
    mise_a_jour DATE,
    date_dernier_rapport DATE,
    normalized_molecule_name VARCHAR(255),
    atc_code VARCHAR(50),
    atc_class_code VARCHAR(50),
    atc_class_name VARCHAR(255),
    manufacturer VARCHAR(255)
);

-- Copy data from the CSV file into the temporary table
COPY temp_import FROM './big_table_for_import.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',', NULL '');

-- Insert data into normalized tables
INSERT INTO norm_produits (normalized_name)
SELECT DISTINCT normalized_name FROM temp_import
ON CONFLICT (normalized_name) DO NOTHING;

INSERT INTO molecules (name)
SELECT DISTINCT normalized_molecule_name FROM temp_import
ON CONFLICT (name) DO NOTHING;

INSERT INTO classe_atc (code, description)
SELECT DISTINCT atc_class_code, atc_class_name FROM temp_import
ON CONFLICT (code) DO NOTHING;

INSERT INTO produits (name, norm_product_id, manufacturer)
SELECT DISTINCT t.normalized_name, np.id, t.manufacturer
FROM temp_import t
JOIN norm_produits np ON t.normalized_name = np.normalized_name
ON CONFLICT (name) DO NOTHING;

INSERT INTO incidents (product_id, status, start_date, end_date, mise_a_jour, date_dernier_rapport)
SELECT p.id, t.status, t.start_date, t.end_date, t.mise_a_jour, t.date_dernier_rapport
FROM temp_import t
JOIN produits p ON t.normalized_name = p.name;

INSERT INTO produits_molecules (produit_id, molecule_id)
SELECT DISTINCT p.id, m.id
FROM temp_import t
JOIN produits p ON t.normalized_name = p.name
JOIN molecules m ON t.normalized_molecule_name = m.name
ON CONFLICT (produit_id, molecule_id) DO NOTHING;

INSERT INTO molecules_classe_atc (molecule_id, classe_atc_id)
SELECT DISTINCT m.id, ca.id
FROM temp_import t
JOIN molecules m ON t.normalized_molecule_name = m.name
JOIN classe_atc ca ON t.atc_class_code = ca.code
ON CONFLICT (molecule_id, classe_atc_id) DO NOTHING;

-- Clean up
DROP TABLE temp_import;
