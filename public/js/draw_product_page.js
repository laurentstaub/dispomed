/**
 * Draws the timeline chart for a product's incidents
 * @param {Object} product - The product data object
 * @param {string} containerId - The ID of the container element
 */
function drawProductTimeline(product, containerId) {
  if (!product.incidents || !product.incidents.length) {
    return;
  }

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
      .attr('fill', 'var(--gristresleger)');

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

// On page load: draw timeline and update current status label
// Requires productData global variable

document.addEventListener('DOMContentLoaded', function() {
  if (typeof productData !== 'undefined') {
    drawProductTimeline(productData, 'productpg-timeline-container');

    // Update current status label with duration
    if (productData.incidents && productData.incidents.length) {
      const current = productData.incidents[0];
      const statusLabel = document.querySelector('.productpg-status-label');
      if (statusLabel && current.start_date) {
        const now = new Date();
        const start = new Date(current.start_date);
        const diffDays = getDaysBetween(start, now);
        const durationLabel = formatDurationSince(diffDays);
        statusLabel.textContent = `Statut actuel : ${current.status} ${durationLabel}`;
      }
    }
  }
}); 