import { getDaysBetween, formatDurationSince, getProductStatus } from './utils.js';
import { dataManager } from './01_store_data.js';
import { fetchTableChartData } from './00_fetch_data.js';

/**
 * Draws the timeline chart for a product's incidents
 * @param {Object} product - The product data object
 * @param {string} containerId - The ID of the container element
 */
function drawProductTimeline(product, containerId) {
  if (!product.incidents || !product.incidents.length) {
    return;
  }

  // Sort incidents by start_date ascending (oldest first)
  product.incidents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  const container = d3.select(`#${containerId}`);
  container.html(''); // Clear existing content

  // Timeline configuration
  const timelineStart = new Date(2021, 3, 1); // April 2021 (month is 0-based)
  const timelineEnd = new Date();
  const totalDays = Math.round((timelineEnd - timelineStart) / (1000 * 60 * 60 * 24));
  const margin = { top: 15, right: 20, bottom: 30, left: 20 };
  const barHeight = 14;
  const barGap = 10;
  const barY = 24;
  const labelWidth = 160;
  const incidentCount = product.incidents.length;
  const chartHeight = barY + incidentCount * (barHeight + barGap);
  const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
  const height = chartHeight;

  // Create SVG
  const svg = container.append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Create scales
  const xScale = d3.scaleTime()
    .domain([timelineStart, timelineEnd])
    .range([0, width - labelWidth]);

  // Add timeline axis at the very top, shifted by labelWidth
  const xAxis = d3.axisTop(xScale)
    .ticks(d3.timeYear.every(1))
    .tickFormat(d3.timeFormat('%Y'))
    .tickSizeOuter(4)
    .tickPadding(8);

  // Add vertical grid lines for quarters and years
  const gridGroup = svg.append('g')
    .attr('class', 'grid-lines')
    .attr('transform', `translate(${labelWidth},0)`);

  // Add year grid lines (more prominent)
  gridGroup.selectAll('.grid-line-year')
    .data(xScale.ticks(d3.timeYear.every(1)))
    .enter()
    .append('line')
    .attr('class', 'grid-line-year')
    .attr('x1', d => xScale(d))
    .attr('x2', d => xScale(d))
    .attr('y1', margin.top)
    .attr('y2', height)
    .attr('stroke', 'var(--grisleger)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,3');

  // Create a separate group for horizontal gridlines
  const horizontalGridGroup = svg.append('g')
    .attr('class', 'horizontal-grid-lines');

  // Add axis with more prominent styling
  const xAxisGroup = svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(${labelWidth},10)`);

  xAxisGroup.call(xAxis);

  // Style the axis
  xAxisGroup.select('.domain')
    .attr('stroke', 'var(--grisfonce)')
    .attr('stroke-width', 2);

  xAxisGroup.selectAll('.tick text')
    .attr('fill', 'var(--grisfonce)')
    .attr('font-size', '14px')
    .attr('font-weight', 600);

  xAxisGroup.selectAll('.tick line')
    .attr('stroke', 'var(--grisfonce)')
    .attr('stroke-width', 2);

  // Add horizontal grid lines for each row
  product.incidents.forEach((incident, index) => {
    const start = new Date(Math.max(new Date(incident.start_date), timelineStart));
    const end = new Date(Math.min(new Date(incident.calculated_end_date || incident.end_date || timelineEnd), timelineEnd));
    const xStart = xScale(start);
    const xEnd = xScale(end);
    const barWidth = Math.max(2, xEnd - xStart);
    const y = barY + index * (barHeight + barGap);

    // 1. Add background for the bar row first
    svg.append('rect')
      .attr('x', labelWidth)
      .attr('y', y)
      .attr('width', width - labelWidth)
      .attr('height', barHeight)
      .attr('rx', 0)
      .attr('fill', 'var(--blanc)');

    // 2. Add horizontal grid line
    svg.append('line')
      .attr('class', 'grid-line-horizontal')
      .attr('x1', labelWidth)
      .attr('x2', width)
      .attr('y1', y + barHeight / 2)
      .attr('y2', y + barHeight / 2)
      .attr('stroke', 'var(--gristresleger)')
      .attr('stroke-width', 1);

    // 3. Add the colored bar on top
    svg.append('rect')
      .attr('x', xStart + labelWidth)
      .attr('y', y)
      .attr('width', barWidth)
      .attr('height', barHeight)
      .attr('rx', 0)
      .attr('fill', getStatusColor(incident.status));

    // 4. Add label last
    svg.append('text')
      .attr('x', 0)
      .attr('y', y + barHeight - 2)
      .attr('fill', 'var(--grisfonce)')
      .attr('font-size', 15)
      .attr('font-family', 'inherit')
      .attr('alignment-baseline', 'middle')
      .text(`${incident.status} ${formatDate(start)} - ${formatDate(end)}`);
  });

  // --- Add stats per year and total since April 2021 ---
  const years = [2021, 2022, 2023, 2024, 2025];
  const yearlyStats = {};
  years.forEach(year => {
    yearlyStats[year] = { rupture: 0, tension: 0, arret: 0, total: 0 };
    const yearStart = new Date(Math.max(new Date(year, 0, 1), timelineStart));
    const yearEnd = new Date(Math.min(new Date(year, 11, 31), timelineEnd));
    if (yearEnd > yearStart) {
      yearlyStats[year].total = Math.floor((yearEnd - yearStart) / (1000 * 60 * 60 * 24)) + 1;
    }
  });

  let ruptureDays = 0;
  let tensionDays = 0;
  let arretDays = 0;
  let totalScore = 0;

  product.incidents.forEach(incident => {
    const incidentStart = new Date(incident.start_date);
    const incidentEnd = new Date(incident.calculated_end_date || incident.end_date || timelineEnd);

    years.forEach(year => {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);

      const overlapStart = new Date(Math.max(incidentStart, yearStart, timelineStart));
      const overlapEnd = new Date(Math.min(incidentEnd, yearEnd, timelineEnd));

      if (overlapEnd > overlapStart) {
        const days = Math.floor((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
        if (incident.status === 'Rupture') {
          yearlyStats[year].rupture += days;
        } else if (incident.status === 'Tension') {
          yearlyStats[year].tension += days;
        } else if (incident.status === 'Arret') {
          yearlyStats[year].arret += days;
        }
      }
    });

    // Also update total counts for the entire period
    const start = new Date(Math.max(new Date(incident.start_date), timelineStart));
    const end = new Date(Math.min(new Date(incident.calculated_end_date || incident.end_date || timelineEnd), timelineEnd));
    if (end > start) {
      const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
       if (incident.status === 'Rupture') {
        ruptureDays += days;
        totalScore -= days;
      } else if (incident.status === 'Tension') {
        tensionDays += days;
        totalScore -= days * 0.5;
      } else if (incident.status === 'Arret') {
        arretDays += days;
        totalScore -= days;
      }
    }
  });

  const totalDaysPeriod = Math.floor((timelineEnd - timelineStart) / (1000 * 60 * 60 * 24)) + 1;
  const rupturePercent = ((ruptureDays / totalDaysPeriod) * 100).toFixed(1);
  const tensionPercent = ((tensionDays / totalDaysPeriod) * 100).toFixed(1);
  const arretPercent = ((arretDays / totalDaysPeriod) * 100).toFixed(1);
  // Score: (totalDays + totalScore) / totalDays
  const score = (((totalDaysPeriod + totalScore) / totalDaysPeriod) * 100).toFixed(1);

  // Color code the score
  const scoreValue = parseFloat(score);

  // Donut chart values
  const disponibleDays = totalDaysPeriod - ruptureDays - tensionDays - arretDays;
  const disponiblePercent = ((disponibleDays / totalDaysPeriod) * 100).toFixed(1);
  const donutSize = 70;
  const donutStroke = 12;
  const center = donutSize / 2;
  const radius = (donutSize - donutStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const scoreArc = scoreValue / 100 * circumference;
  const donutSVG = `
    <svg width="${donutSize}" height="${donutSize}" viewBox="0 0 ${donutSize} ${donutSize}">
      <circle
        cx="${center}" cy="${center}" r="${radius}"
        fill="none" stroke="var(--gristrestresleger)" stroke-width="${donutStroke}"
      />
      <circle
        cx="${center}" cy="${center}" r="${radius}"
        fill="none" stroke="var(--grisfonce)" stroke-width="${donutStroke}"
        stroke-dasharray="${scoreArc} ${circumference - scoreArc}"
        stroke-dashoffset="${circumference / 4}"
        style="transition: stroke-dasharray 0.5s;"
      />
      <text x="${center}" y="${center + 5}" text-anchor="middle" font-size="0.8rem" font-weight="600" fill="var(--grisfonce)">${score}%</text>
    </svg>
  `;

  // Add stats to the page above the timeline
  let statsContainer = document.getElementById('productpg-stats');
  if (!statsContainer) {
    statsContainer = document.createElement('div');
    statsContainer.id = 'productpg-stats';
    // Insert stats before the timeline container
    const timelineNode = container.node();
    timelineNode.parentNode.insertBefore(statsContainer, timelineNode);
  }

  const formatZero = (n) => (n === 0 ? '-' : n);

  statsContainer.innerHTML = `
    <div class="productpg-score-flex">
      <div class="productpg-score-stats">
        <div class="productpg-stats-title">Jours de disponibilité depuis avril 2021</div>
        <table class="productpg-stats-table">
          <thead>
            <tr>
              <th></th>
              ${years.map((y, i) => `<th class="${i === 0 ? 'year-start-col' : ''}">${y}</th>`).join('')}
              <th class="total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="productpg-stats-label">Disponible</td>
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}"><span class="status-disponible">${formatZero(yearlyStats[y].total - yearlyStats[y].rupture - yearlyStats[y].tension - yearlyStats[y].arret)}</span></td>`).join('')}
              <td class="productpg-stats-value total-col"><span class="status-disponible">${formatZero(disponibleDays)}</span></td>
            </tr>
            <tr>
              <td class="productpg-stats-label">Tension</td>
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}"><span class="status-tension">${formatZero(yearlyStats[y].tension)}</span></td>`).join('')}
              <td class="productpg-stats-value total-col"><span class="status-tension">${formatZero(tensionDays)}</span></td>
            </tr>
            <tr>
              <td class="productpg-stats-label">Rupture</td>
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}"><span class="status-rupture">${formatZero(yearlyStats[y].rupture)}</span></td>`).join('')}
              <td class="productpg-stats-value total-col"><span class="status-rupture">${formatZero(ruptureDays)}</span></td>
            </tr>
            <tr>
              <td class="productpg-stats-label">Arrêt</td>
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}"><span class="status-arret">${formatZero(yearlyStats[y].arret)}</span></td>`).join('')}
              <td class="productpg-stats-value total-col"><span class="status-arret">${formatZero(arretDays)}</span></td>
            </tr>
            <tr class="total-row">
              <td class="productpg-stats-label">Total</td>
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}">${formatZero(yearlyStats[y].total)}</td>`).join('')}
              <td class="productpg-stats-value total-col">${formatZero(totalDaysPeriod)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="productpg-score-donut">
        <div class="productpg-stats-title">Score de disponibilité</div>
        <span style="font-size:12px;">100% = toujours disponible<br>
        0% = toujours en rupture</span><br>
        ${donutSVG}
      </div>
    </div>
  `;
}

// Helper to get color for status
function getStatusColor(status) {
  switch (status) {
    case 'Rupture':
      return 'var(--rupture)';
    case 'Tension':
      return 'var(--tension)';
    case 'Arret':
      return 'var(--arret-bg)';
    default:
      return 'var(--grisleger)';
  }
}

// Format a date to French format (MM/YY)
function formatDate(date) {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${year}`;
}

// Helper to format a date to French (e.g. 14 juin 2024)
function formatFrenchDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date)) return '';
  return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Helper to determine current product status with main page priority logic
function getCurrentProductStatus(incidents, reportDate) {
  incidents.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  let latestIncident = incidents[0];
  return getProductStatus(latestIncident, reportDate);
}

// Add a resize listener to redraw the timeline on window resize
window.addEventListener('resize', debounce(() => {
  if (window.productIncidents) {
    drawProductTimeline({ incidents: window.productIncidents }, 'productpg-timeline-container');
  }
}, 250));

// On page load: draw timeline and update current status label
// Requires productData global variable

document.addEventListener('DOMContentLoaded', async function() {
  if (window.productId) {
    try {
      // Fetch all incidents for this product by ID
      const response = await fetch(`/api/incidents/product/${window.productId}`);
      const incidents = await response.json();
      window.productIncidents = incidents; // Store for resize
      const cisListDiv = document.getElementById('cis-list');
      const statsDiv = document.getElementById('productpg-stats');
      const timelineDiv = document.getElementById('productpg-timeline-container');
      if (!incidents.length) {
        if (cisListDiv) cisListDiv.innerHTML = '';
        if (statsDiv) statsDiv.innerHTML = '';
        if (timelineDiv) timelineDiv.innerHTML = '<p style="margin:2rem 0 0 0;font-size:1.1em;color:var(--grisfonce);">Aucun incident enregistré.</p>';
        document.querySelector('.productpg-status-label').textContent = 'Aucun incident enregistré.';
        return;
      }
      // Find the latest incident by start_date
      incidents.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
      const latestIncident = incidents[0];

      if (incidents.length > 0) {
        const accentedProductName = incidents[0].accented_product || incidents[0].product || '';
        const moleculeName = incidents[0].molecule || '';
        const reportTitle = document.getElementById('report-title');
        if (reportTitle) {
          reportTitle.textContent = accentedProductName;
        }
        const infoSubtitle = document.getElementById('mise-a-jour');
        if (infoSubtitle) {
          infoSubtitle.textContent = (moleculeName ? `DCI : ${moleculeName}` : '');
        }
        document.title = accentedProductName + ' - Détails du produit';
      }

      // Use the latest calculated_end_date as the report date
      const reportDate = incidents.reduce((max, inc) => {
        const d = new Date(inc.calculated_end_date);
        return d > max ? d : max;
      }, new Date(incidents[0].calculated_end_date));
      const status = getProductStatus(latestIncident, reportDate);
      const statusLabel = document.querySelector('.productpg-status-label');
      const statusIcon = document.querySelector('.productpg-status-icon i');
      const statusRow = document.querySelector('.productpg-status-row');
      // Render CIS codes
      const allCisCodes = Array.from(new Set(
        incidents.flatMap(incident => incident.cis_codes || [])
      ));
      if (cisListDiv) {
        cisListDiv.innerHTML = '';
        if (allCisCodes.length > 0) {
          const cisSection = document.createElement('div');
          cisSection.className = 'cis-section';
          
          // Créer le bouton toggle
          const toggleButton = document.createElement('button');
          toggleButton.className = 'cis-toggle-button';
          toggleButton.innerHTML = `
            <i class="fa-solid fa-chevron-down"></i>
            <span>Codes CIS concernés (${allCisCodes.length})</span>
          `;
          
          // Créer le conteneur pour le contenu
          const contentDiv = document.createElement('div');
          contentDiv.className = 'cis-content';
          
          // Créer un objet qui mappe les codes CIS à leurs dénominations
          const cisNamesMap = {};
          incidents.forEach(incident => {
            if (incident.cis_names) {
              Object.assign(cisNamesMap, incident.cis_names);
            }
          });
          
          const listContainer = document.createElement('div');
          listContainer.className = 'cis-list-container';
          
          allCisCodes.forEach(code => {
            const item = document.createElement('div');
            item.className = 'cis-item';
            
            const codeSpan = document.createElement('span');
            codeSpan.className = 'cis-code';
            codeSpan.textContent = code;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'cis-name';
            nameSpan.textContent = cisNamesMap[code] || 'Dénomination non disponible';
            
            item.appendChild(codeSpan);
            item.appendChild(nameSpan);
            listContainer.appendChild(item);
          });
          
          contentDiv.appendChild(listContainer);
          
          // Ajouter les éléments à la section
          cisSection.appendChild(toggleButton);
          cisSection.appendChild(contentDiv);
          cisListDiv.appendChild(cisSection);
          
          // Ajouter l'événement click pour le toggle
          toggleButton.addEventListener('click', () => {
            const isExpanded = toggleButton.classList.contains('expanded');
            toggleButton.classList.toggle('expanded');
            contentDiv.classList.toggle('expanded');
          });
        }
      }
      // Lookup related EMA incidents by CIS code
      const emaIncidentsDiv = document.getElementById('ema-incidents');
      if (emaIncidentsDiv && allCisCodes.length > 0) {
        fetch(`/api/ema-incidents?cis_codes=${allCisCodes.join(',')}`)
          .then(res => res.json())
          .then(emaIncidents => {
            if (!emaIncidents.length) {
              emaIncidentsDiv.innerHTML = `<div class="ema-incident-card">
                <div class="ema-incident-title">Aucun incident EMA lié</div>
              </div>`;
              return;
            }
            emaIncidentsDiv.innerHTML = '<ul>' +
              emaIncidents.map(inc =>
                `<div class="ema-incident-card">
                  <div class="ema-incident-title">${inc.product_name || inc.title || inc.incident_id}</div>
                  <div class="ema-incident-status">${inc.status ? `<span>${inc.status}</span>` : ''}</div>
                  <div class="ema-incident-detail"><div class="ema-incident-label">Date de première publication</div><div class="ema-incident-value">${formatFrenchDate(inc.first_published) || 'N/A'}</div></div>
                  <div class="ema-incident-detail"><div class="ema-incident-label">Raison de l'incident</div><div class="ema-incident-value">${inc.reason_for_shortage_fr || 'N/A'}</div></div>
                  <div class="ema-incident-detail"><div class="ema-incident-label">Pays touchés</div><div class="ema-incident-value">${inc.member_states_affected_fr || 'N/A'}</div></div>
                  <div class="ema-incident-detail"><div class="ema-incident-label">Résolution attendue</div><div class="ema-incident-value">${formatFrenchDate(inc.expected_resolution) || 'N/A'}</div></div>
                  ${inc.summary_fr ? `<div class="ema-incident-summary"><div class="ema-incident-label">Résumé</div><div class="ema-incident-value">${inc.summary_fr}</div></div>` : ''}
                </div>`
              ).join('') + '</ul>';
          })
          .catch(() => {
            emaIncidentsDiv.innerHTML = 'Erreur lors de la récupération des incidents EMA.';
          });
      }

      // Fetch and display therapeutic alternatives
      const substitutionsDiv = document.getElementById('substitutions-container');
      if (substitutionsDiv && allCisCodes.length > 0) {
        // Fetch alternatives for each CIS code
        const allAlternatives = [];
        for (const cisCode of allCisCodes) {
          try {
            const response = await fetch(`/api/substitutions/${cisCode}`);
            const alternatives = await response.json();
            allAlternatives.push(...alternatives);
          } catch (error) {
            console.error(`Error fetching alternatives for CIS ${cisCode}:`, error);
          }
        }

        // Remove duplicates and sort by score
        const uniqueAlternatives = allAlternatives
          .filter((alt, index, self) => 
            index === self.findIndex(a => a.code_cis_cible === alt.code_cis_cible)
          )
          .sort((a, b) => b.score_similarite - a.score_similarite)
          .slice(0, 10); // Limit to top 10

        if (uniqueAlternatives.length === 0) {
          substitutionsDiv.innerHTML = '<p style="margin:2rem 0 0 0;font-size:1.1em;color:var(--grisfonce);">Aucune alternative thérapeutique trouvée.</p>';
        } else {
          const table = document.createElement('table');
          table.className = 'substitutions-table';
          
          table.innerHTML = `
            <thead>
              <tr>
                <th>Code CIS</th>
                <th>Type d'équivalence</th>
                <th>Score de similarité</th>
              </tr>
            </thead>
            <tbody>
              ${uniqueAlternatives.map(alt => `
                <tr>
                  <td>${alt.code_cis_cible}</td>
                  <td>${alt.type_equivalence}</td>
                  <td>${(alt.score_similarite * 100).toFixed(0)}%</td>
                </tr>
              `).join('')}
            </tbody>
          `;
          
          substitutionsDiv.appendChild(table);
        }
      }

      // Update status label and icon
      if (statusLabel && statusIcon && statusRow) {
        statusRow.classList.remove('status-disponible', 'status-tension', 'status-rupture');
        if (status.shorthand === 'rupture') {
          statusRow.classList.add('status-rupture');
        } else if (status.shorthand === 'tension') {
          statusRow.classList.add('status-tension');
        } else if (status.shorthand === 'arret') {
          statusRow.classList.add('status-rupture');
        } else {
          statusRow.classList.add('status-disponible');
        }
        statusLabel.textContent = `Statut actuel : ${status.text}`;
        statusIcon.className = status.icon + ' ' + status.shorthand + '-icon';
        statusIcon.style.color = status.color;
      }
      // Draw timeline and stats (update this as needed)
      drawProductTimeline({ incidents }, 'productpg-timeline-container');
    } catch (err) {
      document.querySelector('.productpg-status-label').textContent = 'Erreur : impossible de déterminer la date de rapport.';
    }
  }
});

// Helper function to debounce calls
function debounce(func, delay) {
  let debounceTimer;
  return function(...args) {
    const context = this;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(context, args), delay);
  };
} 
