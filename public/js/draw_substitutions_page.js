/**
 * Fetches and displays therapeutic substitutions for a given CIS code.
 * @param {string} cisCode - The CIS code of the drug.
 */
async function fetchAndDrawSubstitutions(cisCode) {
  const container = document.getElementById('substitutions-container');
  if (!container) return;

  container.innerHTML = '<p>Recherche des alternatives...</p>';

  try {
    const response = await fetch(`/api/substitutions/${cisCode}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const substitutions = await response.json();

    // Define the desired sort order
    const sortOrder = {
      'GENERIQUE_OFFICIEL': 1,
      'SIMILITUDE_THERAPEUTIQUE': 2,
      'ALTERNATIVE_THERAPEUTIQUE': 3
    };

    // Sort the substitutions array
    substitutions.sort((a, b) => {
      const orderA = sortOrder[a.type_equivalence] || 99; // Assign a high number for any unlisted types
      const orderB = sortOrder[b.type_equivalence] || 99;
      return orderA - orderB;
    });

    // Filter out duplicates, keeping the first one seen (which is the highest priority due to sorting)
    const seenCisCodes = new Set();
    const uniqueSubstitutions = substitutions.filter(sub => {
      const isOrigin = sub.code_cis_origine.toString() === cisCode.toString();
      const alternativeCis = isOrigin ? sub.code_cis_cible : sub.code_cis_origine;
      if (seenCisCodes.has(alternativeCis)) {
        return false;
      }
      seenCisCodes.add(alternativeCis);
      return true;
    });

    container.innerHTML = ''; // Clear loading message

    // Group substitutions by type
    const groupedSubstitutions = uniqueSubstitutions.reduce((acc, sub) => {
      const type = sub.type_equivalence;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(sub);
      return acc;
    }, {});

    const displayOrder = ['GENERIQUE_OFFICIEL', 'SIMILITUDE_THERAPEUTIQUE', 'ALTERNATIVE_THERAPEUTIQUE'];
    const titleMap = {
      'GENERIQUE_OFFICIEL': 'Génériques officiels',
      'SIMILITUDE_THERAPEUTIQUE': 'Similitude thérapeutique (même classe ou cible thérapeutique)',
      'ALTERNATIVE_THERAPEUTIQUE': 'Alternatives thérapeutiques (selon indication et utilisation)'
    };

    let resultsFound = false;

    // Render a table for each group in the specified order
    displayOrder.forEach(type => {
      const substitutionsOfType = groupedSubstitutions[type];

      if (substitutionsOfType && substitutionsOfType.length > 0) {
        resultsFound = true;
        const groupTitle = document.createElement('h2');
        groupTitle.className = 'substitution-group-title';
        groupTitle.textContent = titleMap[type] || type.replace(/_/g, ' ');
        container.appendChild(groupTitle);

        const table = document.createElement('table');
        table.className = 'substitutions-table';

        const thead = document.createElement('thead');
        thead.innerHTML = `
          <tr>
            <th>Produit (code CIS)</th>
            <th>Indice de similarité</th>
            <th>Raison</th>
          </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        substitutionsOfType.forEach(sub => {
          const tr = document.createElement('tr');
          const isOrigin = sub.code_cis_origine.toString() === cisCode.toString();
          const alternativeName = isOrigin ? sub.denomination_cible : sub.denomination_origine;
          const alternativeCis = isOrigin ? sub.code_cis_cible : sub.code_cis_origine;

          tr.innerHTML = `
            <td>
              <a href="/product/${alternativeCis}">
                <strong>${alternativeName}</strong>
                <br>
                <small>CIS: ${alternativeCis}</small>
              </a>
            </td>
            <td>${(sub.score_similarite * 100).toFixed(0)}%</td>
            <td>${sub.raison || 'Non spécifié'}</td>
          `;
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        container.appendChild(table);
      }
    });

    if (!resultsFound) {
      container.innerHTML = '<p class="no-data-message">Aucune alternative thérapeutique directe trouvée.</p>';
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des substitutions:', error);
    container.innerHTML = '<p class="error-message">Erreur lors du chargement des alternatives.</p>';
  }
}

// Main execution on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  if (window.cis_code) {
    fetchAndDrawSubstitutions(window.cis_code);
  } else {
    console.error('CIS code not found on page.');
    const container = document.getElementById('substitutions-container');
    if (container) {
      container.innerHTML = '<p class="error-message">Code CIS manquant. Impossible de charger les alternatives.</p>';
    }
  }
}); 