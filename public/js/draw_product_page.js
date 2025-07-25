import { getProductStatus } from './utils.js';

/**
 * Fetches incidents for a specific product ID from the API.
 * @param {string} productId - The ID of the product.
 * @returns {Promise<Array>} A promise that resolves to an array of incidents.
 */
async function fetchProductIncidents(productId) {
    try {
        const response = await fetch(`/api/incidents/product/${productId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching product incidents:', error);
        return null;
    }
}

/**
 * Draws the timeline chart for a product's incidents
 * @param {Object} product - The product data object
 * @param {Array} product.incidents - The incidents data
 * @param {Array} product.salesData - The sales data by CIS and CIP13
 * @param {string} containerId - The ID of the container element
 */
function drawProductTimeline(product, containerId) {
  if (!product.incidents || !product.incidents.length) {
    return;
  }

  // Extract sales data if available
  const salesData = product.salesData || [];

  // Sort incidents by start_date ascending (oldest first)
  product.incidents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  const container = d3.select(`#${containerId}`);
  container.html(''); // Clear existing content

  // Use the global report date if available, otherwise fallback to max calculated_end_date among product incidents
  let timelineEnd;
  if (window.globalReportDate) {
    timelineEnd = new Date(window.globalReportDate);
  } else {
    timelineEnd = new Date(Math.max(...product.incidents.map(inc => new Date(inc.calculated_end_date))));
  }

  // Timeline configuration
  const timelineStart = new Date(2021, 3, 1); // April 2021 (month is 0-based)
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
      const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

      const overlapStart = new Date(Math.max(incidentStart, yearStart, timelineStart));
      const overlapEnd = new Date(Math.min(incidentEnd, yearEnd, timelineEnd));

      if (overlapEnd > overlapStart) {
        const days = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24));
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
  const score = (((totalDaysPeriod + totalScore) / totalDaysPeriod) * 100).toFixed(1);
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

  const formatNumber = (n) => (n === 0 ? '-' : Number(n).toLocaleString('fr-FR'));

  // Process sales data by CIS and CIP13
  const salesByCis = {};

  if (salesData && salesData.length > 0) {
    // Group sales data by CIS code
    salesData.forEach(sale => {
      if (!salesByCis[sale.code_cis]) {
        salesByCis[sale.code_cis] = {
          cis: sale.code_cis,
          cip13Sales: {},
          totalByYear: {}
        };
      }

      // Group by CIP13 within each CIS
      if (!salesByCis[sale.code_cis].cip13Sales[sale.cip13]) {
        salesByCis[sale.code_cis].cip13Sales[sale.cip13] = {
          cip13: sale.cip13,
          label: sale.product_label,
          byYear: {}
        };
      }

      // Store sales by year
      salesByCis[sale.code_cis].cip13Sales[sale.cip13].byYear[sale.year] = sale.total_boxes;

      // Update total by year for this CIS
      if (!salesByCis[sale.code_cis].totalByYear[sale.year]) {
        salesByCis[sale.code_cis].totalByYear[sale.year] = 0;
      }
      salesByCis[sale.code_cis].totalByYear[sale.year] += sale.total_boxes;
    });
  }

  // Generate sales rows HTML
  let salesRowsHtml = '';

  if (Object.keys(salesByCis).length > 0) {
    // Add a header row for sales section
    salesRowsHtml += `
      <tr class="sales-header">
        <td colspan="${years.length + 2}" class="sales-header-cell">Nombre de boîtes vendues</td>
      </tr>
    `;

    // Add rows for each CIS code
    Object.values(salesByCis).forEach(cisSales => {
      // Add rows for each CIP13 within this CIS
      Object.values(cisSales.cip13Sales).forEach(cip13Sale => {
        salesRowsHtml += `
          <tr class="cip13-row">
            <td class="productpg-stats-label">${cip13Sale.label || cip13Sale.cip13}</td>
            ${years.map(year => `<td class="${year === 2021 ? 'year-start-col' : ''}">${formatNumber(cip13Sale.byYear[year] || 0)}</td>`).join('')}
            <td class="productpg-stats-value total-col">${formatNumber(Object.values(cip13Sale.byYear).reduce((sum, val) => sum + Number(val), 0))}</td>
          </tr>
        `;
      });
    });
  }

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
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}"><span class="status-disponible">${formatNumber(yearlyStats[y].total - yearlyStats[y].rupture - yearlyStats[y].tension - yearlyStats[y].arret)}</span></td>`).join('')}
              <td class="productpg-stats-value total-col"><span class="status-disponible">${formatNumber(disponibleDays)}</span></td>
            </tr>
            <tr>
              <td class="productpg-stats-label">Tension</td>
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}"><span class="status-tension">${formatNumber(yearlyStats[y].tension)}</span></td>`).join('')}
              <td class="productpg-stats-value total-col"><span class="status-tension">${formatNumber(tensionDays)}</span></td>
            </tr>
            <tr>
              <td class="productpg-stats-label">Rupture</td>
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}"><span class="status-rupture">${formatNumber(yearlyStats[y].rupture)}</span></td>`).join('')}
              <td class="productpg-stats-value total-col"><span class="status-rupture">${formatNumber(ruptureDays)}</span></td>
            </tr>
            <tr>
              <td class="productpg-stats-label">Arrêt</td>
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}"><span class="status-arret">${formatNumber(yearlyStats[y].arret)}</span></td>`).join('')}
              <td class="productpg-stats-value total-col"><span class="status-arret">${formatNumber(arretDays)}</span></td>
            </tr>
            <tr class="total-row">
              <td class="productpg-stats-label">Total</td>
              ${years.map((y, i) => `<td class="${i === 0 ? 'year-start-col' : ''}">${formatNumber(yearlyStats[y].total)}</td>`).join('')}
              <td class="productpg-stats-value total-col">${formatNumber(totalDaysPeriod)}</td>
            </tr>
            ${salesRowsHtml}
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

// Add a resize listener to redraw the timeline on window resize
window.addEventListener('resize', debounce(() => {
  if (window.productIncidents) {
    drawProductTimeline({ 
      incidents: window.productIncidents,
      salesData: window.productSalesData || []
    }, 'productpg-timeline-container');
  }
}, 250));

// Helper function to debounce calls
function debounce(func, delay) {
  let debounceTimer;
  return function(...args) {
    const context = this;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(context, args), delay);
  };
}

async function main() {
    if (window.productId) {
        try {
          // Fetch all incidents for this product by ID
          const incidents = await fetchProductIncidents(window.productId);
          window.productIncidents = incidents; // Store for resize
          const cisListDiv = document.getElementById('cis-list');
          const statsDiv = document.getElementById('productpg-stats');
          const timelineDiv = document.getElementById('productpg-timeline-container');
          if (!incidents || !incidents.length) {
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
            const atcCode = incidents[0].atc_code || '';
            const atcDescription = incidents[0].classe_atc || '';

            const reportTitle = document.getElementById('report-title');
            if (reportTitle) {
              reportTitle.textContent = accentedProductName;
            }
            const infoSubtitle = document.getElementById('atc-description');
            if (infoSubtitle) {
              let subtitleText = '';
              if (atcDescription) { subtitleText += `${atcDescription} / `; }
              if (atcCode) { subtitleText += `${atcCode} / `; }
              if (moleculeName) { subtitleText += `${moleculeName}`; }

              infoSubtitle.innerHTML = subtitleText;
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

          const cisNamesMap = {};
            incidents.forEach(incident => {
                if (incident.cis_names) {
                Object.assign(cisNamesMap, incident.cis_names);
                }
            });

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

              // Créer un objet qui mappe les codes CIS à leurs dénomination
              const listContainer = document.createElement('div');
              listContainer.className = 'cis-list-container';

              allCisCodes.forEach(code => {
                const item = document.createElement('div');
                item.className = 'cis-item';

                const codeSpan = document.createElement('span');
                codeSpan.className = 'cis-code';
                codeSpan.textContent = `${code} - ${cisNamesMap[code] || 'Dénomination non disponible'}`;

                item.appendChild(codeSpan);
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

          // Fetch sales data by CIS codes
          let salesData = [];
          if (allCisCodes.length > 0) {
            fetch(`/api/sales-by-cis?cis_codes=${allCisCodes.join(',')}`)
              .then(res => res.json())
              .then(data => {
                salesData = data;
                // Store sales data for resize events
                window.productSalesData = data;
                // Draw timeline and stats with sales data
                drawProductTimeline({ incidents, salesData }, 'productpg-timeline-container');
              })
              .catch(error => {
                console.error('Error fetching sales data:', error);
                // Draw timeline and stats without sales data
                drawProductTimeline({ incidents }, 'productpg-timeline-container');
              });
          } else {
            // Draw timeline and stats without sales data
            drawProductTimeline({ incidents }, 'productpg-timeline-container');
          }

          // Lookup related EMA incidents by CIS code
          const emaIncidentsDiv = document.getElementById('ema-incidents');
          if (emaIncidentsDiv && allCisCodes.length > 0) {
            fetch(`/api/ema-incidents?cis_codes=${allCisCodes.join(',')}`)
              .then(res => res.json())
              .then(emaIncidents => {
                if (!emaIncidents.length) {
                  emaIncidentsDiv.innerHTML = `<div class="ema-incident-title">Aucun incident EMA lié</div>`;
                  return;
                }

                const statusTranslations = {
                  'Ongoing': 'En cours',
                  'Resolved': 'Terminé'
                };

                emaIncidentsDiv.innerHTML = '<ul>' +
                  emaIncidents.map(inc => {
                    const translatedStatus = statusTranslations[inc.status] || inc.status;
                    return `<li>
                      <div class="ema-incident-title">${inc.product_name || inc.title || inc.incident_id}</div>
                      <div class="ema-incident-status">${inc.status ? `<span>${translatedStatus}</span>` : ''}</div>
                      <div class="ema-incident-detail"><div class="ema-incident-label">Date de première publication</div><div class="ema-incident-value">${formatFrenchDate(inc.first_published) || 'N/A'}</div></div>
                      <div class="ema-incident-detail"><div class="ema-incident-label">Raison de l'incident</div><div class="ema-incident-value">${inc.reason_for_shortage_fr || 'N/A'}</div></div>
                      <div class="ema-incident-detail"><div class="ema-incident-label">Pays touchés</div><div class="ema-incident-value">${inc.member_states_affected_fr || 'N/A'}</div></div>
                      <div class="ema-incident-detail"><div class="ema-incident-label">Résolution attendue</div><div class="ema-incident-value">${formatFrenchDate(inc.expected_resolution) || 'N/A'}</div></div>
                      ${inc.summary_fr ? `<div class="ema-incident-summary"><div class="ema-incident-label">Résumé</div><div class="ema-incident-value">${inc.summary_fr}</div></div>` : ''}
                    </li>`
                  }).join('') + '</ul>';
              })
              .catch(() => {
                emaIncidentsDiv.innerHTML = 'Erreur lors de la récupération des incidents EMA.';
              });
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

          const alternativesForm = document.getElementById('alternatives-form');
          const cisSelector = document.getElementById('cis-selector');

          if (alternativesForm && cisSelector && allCisCodes.length > 0) {
            // Populate the selector
            allCisCodes.forEach(code => {
              const option = document.createElement('option');
              option.value = code;
              option.textContent = `${cisNamesMap[code] || code}`;
              cisSelector.appendChild(option);
            });

            // Add event listener to the form
            alternativesForm.addEventListener('submit', (event) => {
              event.preventDefault(); // Prevent default form submission
              const selectedCis = cisSelector.value;
              if (selectedCis) {
                window.location.href = `/substitutions/${selectedCis}`;
              }
            });
          } else if (alternativesForm) {
              // Hide the form if there are no CIS codes
              alternativesForm.style.display = 'none';
              const container = document.getElementById('alternatives-navigation-container');
              if (container) {
                container.innerHTML = `<div>Aucune alternative ne peut être recherchée pour ce produit.</div>`;
              }
          }

        } catch (err) {
            console.error(err);
          document.querySelector('.productpg-status-label').textContent = 'Erreur : impossible de déterminer la date de rapport.';
        }
      }
}

// On page load: draw timeline and update current status label
document.addEventListener('DOMContentLoaded', main);
