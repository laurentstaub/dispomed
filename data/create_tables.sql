CREATE TABLE incidents (
    id INT PRIMARY KEY,
    product_id INT,
    status VARCHAR(50),
    start_date DATE,
    end_date DATE,
    mise_a_jour DATE,
    date_dernier_rapport DATE,
    FOREIGN KEY (product_id) REFERENCES produits(id)
);

CREATE TABLE produits (
    id INT PRIMARY KEY,
    name VARCHAR(255),
    norm_product_id INT,
    FOREIGN KEY (norm_product_id) REFERENCES norm_produits(id)
);

CREATE TABLE norm_produits (
    id INT PRIMARY KEY,
    normalized_name VARCHAR(255)
);

CREATE TABLE molecules (
    id INT PRIMARY KEY,
    name VARCHAR(255)
);

CREATE TABLE classe_atc (
    id INT PRIMARY KEY,
    code VARCHAR(50),
    description VARCHAR(255)
);

CREATE TABLE produits_molecules (
    produit_id INT,
    molecule_id INT,
    PRIMARY KEY (produit_id, molecule_id),
    FOREIGN KEY (produit_id) REFERENCES produits(id),
    FOREIGN KEY (molecule_id) REFERENCES molecules(id)
);

CREATE TABLE molecules_classe_atc (
    molecule_id INT,
    classe_atc_id INT,
    PRIMARY KEY (molecule_id, classe_atc_id),
    FOREIGN KEY (molecule_id) REFERENCES molecules(id),
    FOREIGN KEY (classe_atc_id) REFERENCES classe_atc(id)
);
