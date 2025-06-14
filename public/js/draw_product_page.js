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

  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(${labelWidth},10)`)
    .call(xAxis);

  // Draw each incident bar on its own row, with label
  product.incidents.forEach((incident, index) => {
    const start = new Date(incident.start_date);
    const end = new Date(incident.calculated_end_date || incident.end_date || timelineEnd);
    const xStart = xScale(start);
    const xEnd = xScale(end);
    const barWidth = Math.max(2, xEnd - xStart);
    const y = barY + index * (barHeight + barGap);

    // Add background for the bar row
    svg.append('rect')
      .attr('x', labelWidth)
      .attr('y', y)
      .attr('width', width - labelWidth)
      .attr('height', barHeight)
      .attr('rx', 0)
      .attr('fill', 'var(--blanc)');

    // Bar
    svg.append('rect')
      .attr('x', xStart + labelWidth)
      .attr('y', y)
      .attr('width', barWidth)
      .attr('height', barHeight)
      .attr('rx', 0)
      .attr('fill', getStatusColor(incident.status));

    // Label
    svg.append('text')
      .attr('x', 0)
      .attr('y', y + barHeight - 2)
      .attr('fill', 'var(--grisfonce)')
      .attr('font-size', 15)
      .attr('font-family', 'inherit')
      .attr('alignment-baseline', 'middle')
      .text(`${incident.status} ${formatDate(start)} - ${formatDate(end)}`);
  });

  // --- Add stats for total days in Rupture and Tension since April 2021 ---
  let ruptureDays = 0;
  let tensionDays = 0;
  let totalScore = 0;
  product.incidents.forEach(incident => {
    // Get the overlap between the incident and the reference period
    const start = new Date(Math.max(new Date(incident.start_date), timelineStart));
    const end = new Date(Math.min(new Date(incident.calculated_end_date || incident.end_date || timelineEnd), timelineEnd));
    if (end < start) return; // No overlap
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (incident.status === 'Rupture') {
      ruptureDays += days;
      totalScore -= days; // -1 per day
    } else if (incident.status === 'Tension') {
      tensionDays += days;
      totalScore -= days * 0.5; // -0.5 per day
    }
  });
  const totalDaysPeriod = Math.floor((timelineEnd - timelineStart) / (1000 * 60 * 60 * 24)) + 1;
  const rupturePercent = ((ruptureDays / totalDaysPeriod) * 100).toFixed(1);
  const tensionPercent = ((tensionDays / totalDaysPeriod) * 100).toFixed(1);
  // Score: (totalDays + totalScore) / totalDays
  const score = (((totalDaysPeriod + totalScore) / totalDaysPeriod) * 100).toFixed(1);

  // Color code the score
  const scoreValue = parseFloat(score);

  // Donut chart values
  const disponibleDays = totalDaysPeriod - ruptureDays - tensionDays;
  const disponiblePercent = ((disponibleDays / totalDaysPeriod) * 100).toFixed(1);
  const donutSize = 80;
  const donutStroke = 14;
  const center = donutSize / 2;
  const radius = (donutSize - donutStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const disponibleArc = (disponibleDays / totalDaysPeriod) * circumference;
  const donutSVG = `
    <svg width="${donutSize}" height="${donutSize}" viewBox="0 0 ${donutSize} ${donutSize}">
      <circle
        cx="${center}" cy="${center}" r="${radius}"
        fill="none" stroke="var(--gristrestresleger)" stroke-width="${donutStroke}"
      />
      <circle
        cx="${center}" cy="${center}" r="${radius}"
        fill="none" stroke="var(--grisfonce)" stroke-width="${donutStroke}"
        stroke-dasharray="${disponibleArc} ${circumference - disponibleArc}"
        stroke-dashoffset="${circumference / 4}"
        style="transition: stroke-dasharray 0.5s;"
      />
      <text x="${center}" y="${center + 6}" text-anchor="middle" font-size="1rem" font-weight="600" fill="var(--grisfonce)">${score}%</text>
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
  statsContainer.innerHTML = `
    <div class="productpg-score-flex">
      <div class="productpg-score-stats productpg-stats-card">
        <div class="productpg-stats-title">Jours de disponibilité depuis avril 2021</div>
        <table class="productpg-stats-table">
          <thead>
            <tr>
              <th></th>
              <th>Durée (jours)</th>
              <th>Pourcentage (%)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="productpg-stats-label">Période totale</td>
              <td class="productpg-stats-value"><b>${totalDaysPeriod}</b></td>
              <td class="productpg-stats-percent">100%</td>
            </tr>
            <tr>
              <td class="productpg-stats-label">Disponible</td>
              <td class="productpg-stats-value"><b>${disponibleDays}</b></td>
              <td class="productpg-stats-percent">${disponiblePercent}%</td>
            </tr>
            <tr>
              <td class="productpg-stats-label">Tension</td>
              <td class="productpg-stats-value"><b>${tensionDays}</b></td>
              <td class="productpg-stats-percent">${tensionPercent}%</td>
            </tr>
            <tr>
              <td class="productpg-stats-label">Rupture</td>
              <td class="productpg-stats-value"><b>${ruptureDays}</b></td>
              <td class="productpg-stats-percent">${rupturePercent}%</td>
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

// Helper to determine current product status with main page priority logic
function getCurrentProductStatus(incidents, reportDate) {
  console.log(incidents);
  incidents.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  let latestIncident = incidents[0];
  console.log(latestIncident);
  return getProductStatus(latestIncident, reportDate);
}

// On page load: draw timeline and update current status label
// Requires productData global variable

document.addEventListener('DOMContentLoaded', async function() {
  if (window.productId) {
    try {
      // Fetch all incidents for this product by ID
      const response = await fetch(`/api/incidents/product/${window.productId}`);
      const incidents = await response.json();
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
        const productName = incidents[0].product || '';
        const reportTitle = document.getElementById('report-title');
        if (reportTitle) {
          reportTitle.textContent = productName;
        }
      }

      // Use the latest calculated_end_date as the report date
      const reportDate = incidents.reduce((max, inc) => {
        const d = new Date(inc.calculated_end_date);
        return d > max ? d : max;
      }, new Date(incidents[0].calculated_end_date));
      const status = getProductStatus(latestIncident, reportDate);
      console.log(status);
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
          const label = document.createElement('span');
          label.textContent = 'Codes CIS concernés: ';
          cisListDiv.appendChild(label);
          allCisCodes.forEach(code => {
            const pill = document.createElement('span');
            pill.className = 'cis-pill';
            pill.textContent = code;
            cisListDiv.appendChild(pill);
          });
        }
      }
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