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

        // Create table header based on type
        const thead = document.createElement('thead');
        if (type === 'GENERIQUE_OFFICIEL') {
          // For generics, keep the original simple format
          thead.innerHTML = `
            <tr>
              <th>Produit (code CIS)</th>
              <th>Score de similarité</th>
              <th>Raison</th>
            </tr>
          `;
        } else {
          // For SIMILITUDE and ALTERNATIVE, use the detailed scoring format
          thead.innerHTML = `
            <tr>
              <th>Produit (code CIS)</th>
              <th class="score-final-header">Score de similarité</th>
              <th>ATC</th>
              <th>Forme</th>
              <th>Dosage</th>
              <th>Voie</th>
              <th>Commentaire</th>
            </tr>
          `;
        }
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        substitutionsOfType.forEach(sub => {
          const tr = document.createElement('tr');
          const isOrigin = sub.code_cis_origine.toString() === cisCode.toString();
          const alternativeName = isOrigin ? sub.denomination_cible : sub.denomination_origine;
          const alternativeCis = isOrigin ? sub.code_cis_cible : sub.code_cis_origine;

          if (type === 'GENERIQUE_OFFICIEL') {
            // Original format for generics
            tr.innerHTML = `
              <td>
                  <strong>${alternativeName}</strong>
                  <br>
                  <small>CIS: ${alternativeCis}</small>
              </td>
              <td>${(sub.score_similarite * 100).toFixed(0)}%</td>
              <td>${sub.raison || 'Non spécifié'}</td>
            `;
          } else {
            // Detailed scoring format for SIMILITUDE and ALTERNATIVE
            // Extract scores from sub.raison
            let scoreATC = '-', scoreForme = '-', scoreDosage = '-', scoreVoie = '-';
            let commentaire = '';
            
            if (sub.raison && (sub.raison.includes('DCI:') || sub.raison.includes('ATC:'))) {
              const parts = sub.raison.split('|').map(s => s.trim());
              parts.forEach(part => {
                if (part.startsWith('DCI:') || part.startsWith('ATC:')) scoreATC = (parseFloat(part.split(':')[1]) * 100).toFixed(0) + '%';
                if (part.startsWith('Form:')) scoreForme = (parseFloat(part.split(':')[1]) * 100).toFixed(0) + '%';
                if (part.startsWith('Strength:')) scoreDosage = (parseFloat(part.split(':')[1]) * 100).toFixed(0) + '%';
                if (part.startsWith('Route:')) scoreVoie = (parseFloat(part.split(':')[1]) * 100).toFixed(0) + '%';
              });

              // Generate explanatory comment based on scores
              if (scoreATC === '100%' && scoreForme === '100%' && scoreDosage === '100%' && scoreVoie === '100%') {
                commentaire = 'Produit identique';
              } else if (scoreATC === '100%' && scoreForme === '100%' && scoreDosage !== '100%' && scoreVoie === '100%') {
                commentaire = 'Produit identique avec dosage différent';
              } else if (scoreATC === '100%' && scoreForme !== '100%') {
                commentaire = 'Forme différente';
              } else if (scoreATC !== '100%') {
                commentaire = 'Classe thérapeutique différente';
              } else {
                commentaire = 'Voir détails';
              }
            } else {
              commentaire = sub.raison || 'Non spécifié';
            }

            tr.innerHTML = `
              <td>
                  <strong>${alternativeName}</strong>
                  <br>
                  <small>CIS: ${alternativeCis}</small>
              </td>
              <td class="score-final-cell">${(sub.score_similarite * 100).toFixed(0)}%</td>
              <td>${scoreATC}</td>
              <td>${scoreForme}</td>
              <td>${scoreDosage}</td>
              <td>${scoreVoie}</td>
              <td>${commentaire}</td>
            `;
          }
          
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