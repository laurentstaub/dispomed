import { dataManager } from "./01_store_data.js";
import { fetchTableChartData } from "./00_fetch_data.js";
import { getDaysBetween, formatDurationSince, getProductStatus } from "./utils.js";

const HOURS_IN_DAY = 24;
const MINS_IN_HOUR = 60;
const SECS_IN_MIN = 60;
const MS_IN_SEC = 1000;
const MS_IN_DAY = HOURS_IN_DAY * MINS_IN_HOUR * SECS_IN_MIN * MS_IN_SEC;
const ALL_TIME_START = new Date(2021, 4, 1);

let rawData = [];
let monthlyData = [];

function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const frFr = d3.timeFormatLocale({
  dateTime: "%A %e %B %Y à %X",
  date: "%d/%m/%Y",
  time: "%H:%M:%S",
  periods: ["", ""],
  days: [ "dimanche", "lundi", "mardi",
    "mercredi", "jeudi", "vendredi","samedi",
  ],
  shortDays: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
  months: [ "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ],
  shortMonths: ["Janv.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."],
});

const formatDate = frFr.format("%e %B %Y");
const formatDateShort = frFr.format("%b");

function getWindowWidth() {
  return window.innerWidth;
}

function shouldShowMarkForMonth(date, monthsToShow) {
  // Always show the current month
  const dateReport = dataManager.getDateReport();
  if (date.getTime() === new Date(dateReport).setDate(1)) {
    return true;
  }

  // For views of 24 months or more, only show quarterly (Jan, Apr, Jul, Oct)
  if (monthsToShow >= 24) {
    return date.getMonth() % 3 === 0; // Show only for months 0 (Jan), 3 (Apr), 6 (Jul), 9 (Oct)
  }

  // Otherwise show all monthly marks
  return true;
}

function identifyRecentStatusChanges(data, recentDays = 7) {
  const dateReport = dataManager.getDateReport();
  const recentDate = new Date(dateReport);
  recentDate.setDate(recentDate.getDate() - recentDays);

  // Products with recently started incidents
  const recentlyStarted = data.filter(d => {
    return d.start_date >= recentDate && d.start_date <= dateReport;
  });

  // Products with recently ended incidents
  const recentlyEnded = data.filter(d => {
    return d.calculated_end_date >= recentDate && d.end_date;
  });

  // Create a map with products as keys and their change type as values
  const productChanges = new Map();

  recentlyStarted.forEach(d => {
    productChanges.set(d.product, {
      type: 'started',
      status: d.status,
      date: d.start_date,
      incident: d
    });
  });

  recentlyEnded.forEach(d => {
    // Only add if not already in the map, or if this end date is more recent
    if (!productChanges.has(d.product) ||
        productChanges.get(d.product).date < d.calculated_end_date) {
      productChanges.set(d.product, {
        type: 'ended',
        status: d.status,
        date: d.calculated_end_date,
        incident: d
      });
    }
  });

  return productChanges;
}

let windowWidth = getWindowWidth();

const labelFontSizeScale = d3
  .scaleLinear()
  .domain([400, 900])
  .range([18, 11])
  .clamp(true);

/**
 * Returns the number of spécialités (CIS codes) for a product.
 * @param {object} product - The product object
 * @returns {number} The number of spécialités
 */
function getSpecialiteCount(product) {
  if (Array.isArray(product.cis_codes) && product.cis_codes.length > 0) {
    return product.cis_codes.length;
  }
  return 1;
};

// Get unique products count
function getUniqueProductLength(eventList) {
  let result = [];

  eventList.forEach((event) => {
    if (!result.includes(event.product)) result.push(event.product);
  });

  return result.length;
}

function formatDuration(years, months, days) {
  const parts = [];
  const pluralize = (value, singular, plural) =>
    value > 0 ? `${value} ${value === 1 ? singular : plural}` : '';

  const yearsPart = pluralize(years, 'an', 'ans');
  const monthsPart = pluralize(months, 'mois', 'mois');
  const daysPart = pluralize(days, 'jour', 'jours');

  if (yearsPart) parts.push(yearsPart);
  if (monthsPart) parts.push(monthsPart);
  if (daysPart) parts.push(daysPart);

  if (parts.length === 0) return '0 jour';

  return parts.join(', ').replace(/, ([^,]*)$/, ' et $1');
}

function daysToYearsMonths(numberOfDays) {
  if (!numberOfDays) return '0 jour';
  const daysInAYear = 365;
  const daysInAMonth = 30;
  const years = Math.floor(numberOfDays / daysInAYear);
  const remainingDays = numberOfDays - years * daysInAYear;
  const months = Math.floor(remainingDays / daysInAMonth);
  const days = remainingDays - months * daysInAMonth;

  return formatDuration(years, months, days);
}

function debounce(func, delay) {
  let debounceTimer;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(debounceTimer);
      func(...args);
    };
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(later, delay);
  };
}

function createDebouncedSearch(callback, delay = 400) {
  let debounceTimer;
  return function (isInitialSetup, searchTerm) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(isInitialSetup, searchTerm);
    }, delay);
  };
}

async function handleSearch(isInitialSetup, searchTerm) {
  const monthsToShow = dataManager.getMonthsToShow();
  const atcClass = dataManager.getATCClass();
  const molecule = dataManager.getMolecule();

  rawData = await fetchTableChartData(isInitialSetup, monthsToShow,
    searchTerm, atcClass, molecule);
  monthlyData = dataManager.processDataMonthlyChart(rawData);
  drawTableChart(rawData, false);
  drawSummaryChart(monthlyData, false);

  // Only update the molecule dropdown when ATC class changes or on initial setup
  // This prevents the dropdown from disappearing when a molecule is selected
  if (isInitialSetup || molecule === "") {
    updateMoleculeDropdown(atcClass);
  }
}

function updateMoleculeDropdown(atcClass) {
  const moleculeSelect = d3.select("#molecule");
  const selectedMoleculeId = dataManager.getMolecule();
  let rawMolecules = dataManager.getMoleculeClassMap();

  if (atcClass !== "") {
    rawMolecules = rawMolecules.filter((mol) => mol.atcClass === atcClass);
  }

  const molecules = rawMolecules.map((mol) => {
    return { code: mol.moleculeId, name: mol.moleculeName };
  });

  // Update dropdown options
  const options = moleculeSelect.selectAll("option")
    .data([{ code: "", name: "Choisir une molécule" }, ...molecules]);

  // Remove old options
  options.exit().remove();

  // Update existing options
  options.text((d) => d.name)
    .attr("value", (d) => d.code);

  // Add new options
  options.enter()
    .append("option")
    .text((d) => d.name)
    .attr("value", (d) => d.code);

  // Set selected option
  if (selectedMoleculeId) {
    moleculeSelect
      .selectAll(`option[value='${selectedMoleculeId}']`)
      .attr("selected", "selected");
  }
}

/***************************/
/*        Listeners        */
/***************************/
window.addEventListener(
  "resize",
  debounce(() => {
    windowWidth = getWindowWidth();
    monthlyData = dataManager.processDataMonthlyChart(rawData);
    drawTableChart(rawData, false);
    drawSummaryChart(monthlyData, false);
  }, 250),
);

// Set up debounced search to avoid querying too often
const debouncedSearch = createDebouncedSearch(handleSearch);

d3.select("#mainfilter-reset").on("click", function () {
  location.reload();
});

// Event listeners for search
d3.select("#mainfilter-search-box").on("input", function () {
  const searchTerm = removeAccents(this.value.toLowerCase());
  dataManager.setSearchTerm(searchTerm);
  debouncedSearch(false, searchTerm);
});


d3.select("#atc").on("input", function () {
  dataManager.setATCClass(this.value);
  dataManager.setMolecule("");
  d3.select("#molecule").property("value", "").dispatch("change");

  handleSearch(false, dataManager.getSearchTerm());
});

d3.select("#molecule").on("input", function () {
  const molecule = this.value;
  dataManager.setMolecule(molecule);

  // Don't rebuild the dropdown, just keep the current value
  const select = d3.select(this);

  // Set the correct option as selected
  select.selectAll("option")
    .property("selected", d => d && d.code === molecule);

  handleSearch(false, dataManager.getSearchTerm());
});

d3.select("#vaccines-filter").on("change", function() {
  dataManager.setVaccinesOnly(this.checked);
  handleSearch(false, dataManager.getSearchTerm());
});

// Replace button click handlers with radio change handlers
const periodRadios = document.querySelectorAll('.mainfilter-radio');
periodRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    const period = e.target.value;
    if (period === '12') {
  dataManager.setMonthsToShow(12);
  handleSearch(true, dataManager.getSearchTerm());
    } else if (period === '24') {
  dataManager.setMonthsToShow(24);
  handleSearch(true, dataManager.getSearchTerm());
    } else if (period === 'all') {
  const end = new Date(dataManager.getDateReport());
  const start = ALL_TIME_START;
  const yearsFromStart = end.getFullYear() - start.getFullYear();
  const monthsFromStart = end.getMonth() - start.getMonth();
  const monthsDiff = yearsFromStart * 12 + monthsFromStart + 1;

  dataManager.setMonthsToShow(monthsDiff);
  handleSearch(true, dataManager.getSearchTerm());
    }
});
});

// Set default selection
document.getElementById('period-12').checked = true;

async function initializeData() {
  rawData = await fetchTableChartData(true);
  monthlyData = dataManager.processDataMonthlyChart(rawData);

  d3.select("#mise-a-jour").text(
    `Mise à jour : ${formatDate(dataManager.getDateReport())}`,
  );
  drawTableChart(rawData, true);
  drawSummaryChart(monthlyData, true);
}

initializeData();

/***********************************/
/*    Draw the top summary chart   */
/***********************************/
function drawSummaryChart(monthlyChartData, isInitialSetup) {
  const margin = { top: 70, right: 15, bottom: 35, left: 10 };
  const height = 380;
  const width = 600;
  const innerHeight = height - margin.top - margin.bottom;
  const innerWidth = width - margin.left - margin.right;

  const startDate = dataManager.getStartDate();
  const endDate = dataManager.getEndDate();
  const parseDate = d3.timeParse("%Y-%m-%d");
  monthlyChartData.forEach((d) => (d.date = parseDate(d.date)));

  const dateReport = dataManager.getDateReport();

  // Filter out months with no data
  const filteredData = monthlyChartData.filter(
    (d) => d.rupture > 0 || d.tension > 0,
  );

  // For 24+ months, only keep one point per quarter (Jan, Apr, Jul, Oct)
  let lineData = filteredData;
  if (dataManager.getMonthsToShow() >= 24) {
    lineData = filteredData.filter(d => [0, 3, 6, 9].includes(d.date.getMonth()));
  }

  if (monthlyChartData.length === 0) {
    d3.select("#summary").style("display", "none");
    return;
  }

  // Create scales
  const xScale = d3.scaleTime()
    .domain([startDate, endDate])
    .range([0, innerWidth]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(lineData, (d) => Math.max(d.rupture, d.tension))])
    .nice()
    .range([innerHeight, 0]);

  const xAxis = d3.axisBottom(xScale)
    .ticks(dataManager.getMonthsToShow() >= 24 ? d3.timeMonth.every(3) : d3.timeMonth.every(1))
    .tickFormat((d) => {
      if (d.getMonth() === 0) {
        return d3.timeFormat("%Y")(d);
      }
      return formatDateShort(d);
    })
    .tickSize(4);

  // Create line generators
  const lineTension = d3.line()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.tension))
    .defined((d) => d.tension > 0);

  const lineRupture = d3.line()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.rupture))
    .defined((d) => d.rupture > 0);

  // Create SVG
  let svg;
  if (isInitialSetup) {
    svg = d3.select("#summary")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
  } else {
    svg = d3.select("#summary svg");
    svg.selectAll("*").remove();
  }

  const group = svg.append("g")
      .attr("transform", "translate(0, 0)");

  const titleText = svg.append("text")
    .attr("class", "sumchart-chart-title")
    .attr("x", 10)
    .attr("y", 20)
    .attr("text-anchor", "start")
    .text("Évolution des ruptures et tensions");

  const bbox = titleText.node().getBBox();
  group.insert("rect", "text")
      .attr("x", bbox.x - 10)
      .attr("y", bbox.y - 5)
      .attr("width", bbox.width + 20)
      .attr("height", bbox.height + 10)
      .style("fill", "var(--blanc")
      .style("rx", 5) // Rounded corners
      .style("ry", 5);

  group.append("text")
      .attr("class", "sumchart-chart-subtitle")
      .attr("x", 10)
      .attr("y", 24 + bbox.height) // Position below the title with spacing
      .attr("text-anchor", "start")
      .text("En nombre de spécialités (Codes CIS) manquantes le 1er de chaque période");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("rect")
    .attr("width", "100%")
    .attr("height", `${innerHeight}`)
    .attr("fill", "white");

  g.append("g")
    .attr("class", "sumchart-x-axis")
    .attr("transform", `translate(0, ${innerHeight})`)
    .call(xAxis);

  // Style yearly tick
  g.selectAll(".sumchart-x-axis .tick text")
    .filter((d) => d.getMonth() === 0)
    .style("font-weight", "bold")
    .style("font-size", "11px")
    .style("fill", "var(--grisfonce)");

  // Style month labels differently
  g.selectAll(".sumchart-x-axis .tick text")
    .filter((d) => d.getMonth() !== 0)
    .style("font-size", "10px")
    .style("fill", "var(--grisleger)");

  g.selectAll(".sumchart-x-axis text")
    .style("font-size", `${labelFontSizeScale(windowWidth)}px`,
  );

  // Draw lines
  g.append("path")
    .datum(lineData)
    .attr("class", "sumchart-tension-line")
    .attr("d", lineTension);

  g.append("path")
    .datum(lineData)
    .attr("class", "sumchart-rupture-line")
    .attr("d", lineRupture);

  // Add marks (circles) for rupture data points - WITH FILTERING
  g.selectAll(".sumchart-rupture-mark")
    .data(lineData.filter((d) => d.rupture > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
    .enter()
    .append("circle")
    .attr("class", "sumchart-rupture-mark")
    .attr("cx", (d) => xScale(d.date))
    .attr("cy", (d) => yScale(d.rupture))
    .attr("r", 1)

  // Add marks (circles) for tension data points - WITH FILTERING
  g.selectAll(".sumchart-tension-mark")
    .data(lineData.filter((d) => d.tension > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
    .enter()
    .append("circle")
    .attr("class", "sumchart-tension-mark")
    .attr("cx", (d) => xScale(d.date))
    .attr("cy", (d) => yScale(d.tension))
    .attr("r", 1)

  // Add labels for rupture data points - WITH FILTERING
  g.selectAll(".sumchart-rupture-label")
    .data(lineData.filter((d) => d.rupture > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
    .enter()
    .append("text")
    .style("font-size", `${labelFontSizeScale(windowWidth)}px`)
    .attr("class", "sumchart-rupture-label")
    .attr("x", (d) => xScale(d.date))
    .attr("y", (d) => yScale(d.rupture) - 10)
    .attr("text-anchor", "middle")
    .text((d) => d.rupture);

  // Add labels for tension data points - WITH FILTERING
  g.selectAll(".sumchart-tension-label")
    .data(lineData.filter((d) => d.tension > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
    .enter()
    .append("text")
    .style("font-size", `${labelFontSizeScale(windowWidth)}px`)
    .attr("class", "sumchart-tension-label")
    .attr("x", (d) => xScale(d.date))
    .attr("y", (d) => yScale(d.tension) - 10)
    .attr("text-anchor", "middle")
    .text((d) => d.tension);

      let currentRupture = 0;
      let currentTension = 0;

      rawData.forEach((product) => {
        if (product.start_date <= dateReport && product.calculated_end_date >= dateReport) {
          const count = getSpecialiteCount(product);
          if (product.status === "Rupture") {
            currentRupture += count;
          } else if (product.status === "Tension") {
            currentTension += count;
          }
        }
      });

      let currentMonthData = {
        date: dateReport,
        rupture: currentRupture,
        tension: currentTension
      };

    if (currentMonthData) {
      // S'assurer que dateReport est un objet Date
      const dateObj = (dateReport instanceof Date ? dateReport : new Date(dateReport));
      const dayOfMonth = dateObj.getDate();
      const labelOffset = dayOfMonth > 15 ? -5 : 10;
      // Add rupture point if there are ruptures
      if (currentMonthData.rupture > 0) {
        // Add larger circle for current rupture total
        g.append("circle")
          .attr("class", "sumchart-current-point rupture-fill")
          .attr("cx", xScale(dateObj))
          .attr("cy", yScale(currentMonthData.rupture))
          .attr("r", 3);

        // Position label: à gauche si jour > 15, sinon à droite
        g.append("text")
          .attr("class", "sumchart-current-label rupture-fill")
          .attr("x", xScale(dateObj) + labelOffset)
          .attr("y", yScale(currentMonthData.rupture))
          .attr("text-anchor", dayOfMonth > 15 ? "end" : "start")
          .style("font-size", `${labelFontSizeScale(windowWidth) + 2}px`)
          .text(currentMonthData.rupture);
      }

      // Add tension point if there are tensions
      if (currentMonthData.tension > 0) {
        // Add larger circle for current tension total
        g.append("circle")
          .attr("class", "sumchart-current-point tension-fill")
          .attr("cx", xScale(dateObj))
          .attr("cy", yScale(currentMonthData.tension))
          .attr("r", 3);

        // Position label: à gauche si jour > 15, sinon à droite
        g.append("text")
          .attr("class", "sumchart-current-label tension-fill")
          .attr("x", xScale(dateObj) + labelOffset)
          .attr("y", yScale(currentMonthData.tension))
          .attr("text-anchor", dayOfMonth > 15 ? "end" : "start")
          .style("font-size", `${labelFontSizeScale(windowWidth) + 2}px`)
          .text(currentMonthData.tension);
      }
    }
}

/***************************/
/* Create the table chart  */
/***************************/
function getLabelWidth() {
  const root = document.documentElement;
  const isMobile = window.innerWidth <= 700;
  const varName = isMobile ? '--label-width-mobile' : '--label-width';
  const value = getComputedStyle(root).getPropertyValue(varName);
  return parseInt(value, 10) || (isMobile ? 70 : 180); // fallback
}

function drawTableChart(rawData, isInitialSetup, highlightedProducts = []) {
  const dash = d3.select('#maintbl-dash');
  dash.html('');

  // Dynamically measure container width after clearing
  let containerWidth = 900;
  const dashNode = dash.node();
  if (dashNode) {
    const measured = dashNode.getBoundingClientRect().width;
    if (measured && measured > 0) {
      containerWidth = measured;
    } else {
      containerWidth = Math.min(900, window.innerWidth);
    }
  }

  const products = dataManager.getProducts();
  const accentedProducts = dataManager.getAccentedProducts();
  const dateReport = dataManager.getDateReport();
  const startDate = dataManager.getStartDate();
  const endDate = dataManager.getEndDate();
  const rowHeight = 23;
  const barHeight = 15;

  // Identify recently changed products (last 7 days)
  const recentChangesMap = identifyRecentStatusChanges(rawData, 7);
  const recentlyChangedProducts = Array.from(recentChangesMap.keys());

  // Sort products: recently changed first, then the rest
  const sortedProducts = [
    ...recentlyChangedProducts,
    ...products.filter(p => !recentlyChangedProducts.includes(p))
  ];

  // Tooltip (reuse or create)
  let tooltip = d3.select('body').select('#tooltip');
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('id', 'tooltip');
  }

  const isMobile = window.innerWidth <= 700;

  // Responsive layout values
  const iconWidth = isMobile ? 16 : 20;
  const labelWidth = getLabelWidth();
  const statusBoxWidth = isMobile ? 6 : 8;
  const gap = isMobile ? 6 : 12;
  const padding = 8;
  const svgWidth = Math.max(
    50,
    containerWidth - iconWidth - labelWidth - statusBoxWidth - gap - padding
  );

  // Add section title row before the first recently changed product
  let addedSectionTitle = false;
  let recentBlock = null;
  let addedOtherTitle = false;

  sortedProducts.forEach((product, i) => {
    // Insert section title row before the first recently changed product
    if (!addedSectionTitle && recentlyChangedProducts.includes(product)) {
      dash.append('div')
        .attr('class', 'recent-changes-title-row')
        .text('Changements de statut ces 7 derniers jours');
      recentBlock = dash.append('div').attr('class', 'recent-changes-block');
      addedSectionTitle = true;
    }

    // Add title for other products
    if (!recentlyChangedProducts.includes(product) && !addedOtherTitle) {
      dash.append('div')
        .attr('class', 'other-changes-title-row')
        .text('Autres situations de disponibilité');
      addedOtherTitle = true;
    }

    const productIncidents = rawData.filter(d => d.product === product);
    const mainIncident = productIncidents[0] || {};
    const status = getProductStatus(mainIncident, dateReport);

    // Add background for recently changed products
    const isRecentlyChanged = recentlyChangedProducts.includes(product);

    // Row container: use recentBlock for recently changed, dash for others
    const parent = isRecentlyChanged && recentBlock ? recentBlock : dash;
    const row = parent.append('div')
      .attr('class', `maintbl-row-modern hover-${status.shorthand}${isRecentlyChanged ? ' recently-changed-row' : ''}`)
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('min-height', rowHeight + 'px')
      .style('position', 'relative');

    // Status icon
    row.append('span')
      .style('width', iconWidth + 'px')
      .style('text-align', 'center')
      .style('flex-shrink', '0')
      .html(`<i class="${status.icon}" style="color:${status.color}; font-size: 14px;"></i>`);

    // Product label - improved truncation
    const label = accentedProducts[i];
    let shortLabel = label;
    const commaCount = (label.match(/,/g) || []).length;
    if (commaCount === 1) {
      shortLabel = label.split(',')[0];
    }
    row.append('a')
    .attr('class', 'maintbl-row-label')
    .attr('href', `/product/${mainIncident.product_id}`)
    .text(shortLabel)
      .on('mouseover', function () {
        let tooltipContent = `<div class="tooltip-title">${accentedProducts[i]}</div>`;
        tooltipContent += `<div class="tooltip-dci">DCI: ${mainIncident.molecule || ''} / ATC: ${mainIncident.atc_code || ''}</div>`;
        if (status.shorthand === 'rupture' || status.shorthand === 'tension') {
          if (mainIncident.start_date <= dateReport && mainIncident.calculated_end_date >= dateReport) {
            const diffInDays = getDaysBetween(mainIncident.start_date, dateReport);
            tooltipContent += `<div class="tooltip-status ${status.shorthand}"><i class="${status.icon}"></i> ${status.text} ${formatDurationSince(diffInDays)}</div>`;
          }
        } else {
          tooltipContent += `<div class="tooltip-status ${status.shorthand}"><i class="${status.icon}"></i> ${status.text}</div>`;
        }
        // Add CIS codes list as last item
        if (mainIncident.cis_codes && mainIncident.cis_codes.length > 0) {
          tooltipContent += '<div class="tooltip-cis-list"><b>Codes CIS concernés :</b><ul>';
          mainIncident.cis_codes.forEach(code => {
            const name = mainIncident.cis_names && mainIncident.cis_names[code] ? mainIncident.cis_names[code] : '';
            tooltipContent += `<li class="tooltip-cis-item">${code}${name ? ': ' + name : ''}</li>`;
          });
          tooltipContent += '</ul></div>';
        }
        tooltip.transition().duration(200).style('opacity', 1);
        tooltip.html(tooltipContent).attr('class', status.class);
        const labelBox = this.getBoundingClientRect();
        let top = labelBox.bottom + window.scrollY + 5;
        let left = labelBox.left + window.scrollX;
        tooltip.style('left', left + 'px').style('top', top + 'px');
      })
      .on('mouseout', function () {
        tooltip.transition().duration(500).style('opacity', 0);
      });

    const barContainer = row.append('span')
      .style('flex', '1')
      .style('position', 'relative')
      .style('height', rowHeight + 'px')
      .style('margin-right', (statusBoxWidth + 2) + 'px')
      .style('min-width', '0');

    const svg = barContainer.append('svg')
      .attr('width', svgWidth)
      .attr('height', rowHeight);

    const xScale = d3.scaleTime().domain([startDate, endDate]).range([0, svgWidth]);

    // Timeline background
    svg.append('line')
      .attr('x1', 0)
      .attr('x2', xScale(dateReport))
      .attr('y1', rowHeight / 2)
      .attr('y2', rowHeight / 2)
      .attr('stroke', 'var(--vertleger)')
      .attr('stroke-width', 15);

    // Bars
    productIncidents.forEach(d => {
      const barStart = d.start_date > startDate ? d.start_date : startDate;
      const barEnd = d.status === 'Arret' && !d.end_date ? dateReport : d.calculated_end_date;
      
      svg.append('rect')
        .attr('x', xScale(barStart))
        .attr('y', (rowHeight - barHeight) / 2)
        .attr('width', Math.max(2, xScale(barEnd) - xScale(barStart)))
        .attr('height', barHeight)
        .attr('class', `bar ${d.status}-fill`.toLowerCase())
        .style('cursor', 'pointer')
        .on('mousemove', function (event) {
          let tooltipHTML = `
            <div class="tooltip-title">${d.accented_product || d.product}</div>
            <div class="tooltip-dci">DCI: ${d.molecule || ''}</div>
          `;

          const isOngoing = !d.end_date || (d.calculated_end_date && d.calculated_end_date >= dateReport);
          const start = formatDate(d.start_date);
          const startDateObj = new Date(d.start_date);
          const endDateObj = isOngoing ? dateReport : new Date(d.end_date || d.calculated_end_date);
          const end = formatDate(endDateObj);

          const diffDays = getDaysBetween(startDateObj, endDateObj);
          const duration = daysToYearsMonths(diffDays);

          if (d.status === 'Arret') {
            tooltipHTML += `
              <div class="tooltip-status arret">
                Arrêt de commercialisation / ${isOngoing ? 'En cours' : 'Terminé'}<br>
                ${isOngoing
                  ? `Depuis le ${start}`
                  : `Du ${start} au ${end}`
                } (${duration})
              </div>
            `;
          } else if (d.status === 'Rupture' || d.status === 'Tension') {
            tooltipHTML += `
              <div class="tooltip-status ${d.status.toLowerCase()}">
                ${d.status} / ${isOngoing ? 'En cours' : 'Terminé'}<br>
                ${isOngoing
                  ? `Depuis le ${start}`
                  : `Du ${start} au ${end}`
                } (${duration})
              </div>
            `;
          } else if (d.status === 'Disponible') {
            tooltipHTML += `
              <div class="tooltip-status disponible">
                Disponible
              </div>
            `;
          }

          tooltip.html(tooltipHTML).attr('class', `tooltip-${d.status.toLowerCase()}`);

          // Tooltip positioning: below the bar, left-aligned with bar, or right-aligned if not enough space
          const svgRect = svg.node().getBoundingClientRect();
          const barX = xScale(barStart);
          const barW = Math.max(2, xScale(barEnd) - xScale(barStart));
          const barY = (rowHeight - barHeight) / 2;
          // Get the bar's left edge in page coordinates
          const leftEdge = svgRect.left + barX + window.scrollX;
          const topEdge = svgRect.top + barY + barHeight + window.scrollY;

          // Default: tooltip left edge at bar left
          let left = leftEdge;
          let top = topEdge + 2; // 2px gap below bar

          // If tooltip would overflow right, align with bar's right edge
          const tooltipNode = tooltip.node();
          if (tooltipNode) {
            const tooltipWidth = tooltipNode.offsetWidth;
            const barRight = leftEdge + barW;
            if (left + tooltipWidth > window.innerWidth - 8) { // 8px margin
              left = Math.max(8, barRight - tooltipWidth);
            }
          }

          tooltip.style('left', left + 'px').style('top', top + 'px').style('opacity', 1);
        })
        .on('mouseout', function () {
          tooltip.style('opacity', 0);
        });
    });

    // Status box at report date
    svg.append('rect')
      .attr('x', xScale(dateReport) - statusBoxWidth / 2)
      .attr('y', (rowHeight - (isMobile ? 15 : 17)) / 2)
      .attr('width', statusBoxWidth)
      .attr('height', isMobile ? 15 : 17)
      .style('fill', status.color);
  });
}
