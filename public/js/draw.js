import { dataManager } from "./01_store_data.js";
import { fetchTableChartData } from "./00_fetch_data.js";
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

  // Combine both types of changes
  const allRecentChanges = [...recentlyStarted, ...recentlyEnded];

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

const fontSizeScale = d3
  .scaleLinear()
  .domain([400, 900])
  .range([15, 15])
  .clamp(true);

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


function getProductStatus(d) {
  const dateReport = dataManager.getDateReport();

  if (d.status === "Arret") {
    return { text: "Arrêt de commercialisation", class: "tooltip-arret", shorthand: "arret", color: "var(--arret-bg)", icon: "fa-solid fa-circle-xmark" };
  } else if (
    d.start_date <= dateReport &&
    d.calculated_end_date >= dateReport &&
    d.end_date === null
  ) {
    if (d.status === "Rupture") {
      return { text: "Rupture de stock", class: "tooltip-rupture", shorthand: "rupture", color: "var(--rupture)", icon: "fa-solid fa-circle-xmark" };
    } else if (d.status === "Tension") {
      return { text: "Tension d'approvisionnement", class: "tooltip-tension", shorthand: "tension", color: "var(--tension)", icon: "fa-solid fa-circle-exclamation" };
    }
  } else if (!d.calculated_end_date || d.calculated_end_date < dateReport || d.end_date) {
    return { text: "Disponible", class: "tooltip-disponible", shorthand: "disponible", color: "var(--disponiblefonce)", icon: "fa-solid fa-circle-check" };
  }
  return { text: "Statut inconnu", class: "", shorthand: "inconnu", color: "var(--grisleger)", icon: "fa-solid fa-circle-question" };
}

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

  if (parts.length === 0) return '0 jour'; // Cas par défaut

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

d3.select("#reinitialiser").on("click", function () {
  location.reload();
});

// Event listeners for search
d3.select("#search-box").on("input", function () {
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

// Get all period buttons
const periodButtons = document.querySelectorAll(".chart-button");

// Function to highlight selected button and update chart
function selectButton(button) {
  periodButtons.forEach((btn) => btn.classList.remove("button-selected"));
  button.classList.add("button-selected");
}

// Attach event listeners to period buttons
d3.select("#show-12-months").on("click", function () {
  dataManager.setMonthsToShow(12);
  handleSearch(true, dataManager.getSearchTerm());
  selectButton(this);
});

d3.select("#show-24-months").on("click", function () {
  dataManager.setMonthsToShow(24);
  handleSearch(true, dataManager.getSearchTerm());
  selectButton(this);
});

document.getElementById("show-all-data").addEventListener("click", function () {
  const end = new Date(dataManager.getDateReport());
  const start = ALL_TIME_START;
  const yearsFromStart = end.getFullYear() - start.getFullYear();
  const monthsFromStart = end.getMonth() - start.getMonth();
  const monthsDiff = yearsFromStart * 12 + monthsFromStart + 1;

  dataManager.setMonthsToShow(monthsDiff);
  handleSearch(true, dataManager.getSearchTerm());
  selectButton(this);
});

// Set default to 12 months button on page load
window.addEventListener("load", function () {
  const defaultButton = document.getElementById("show-12-months");
  selectButton(defaultButton);
});

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

  const y = d3.scaleLinear()
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
    .y((d) => y(d.tension))
    .defined((d) => d.tension > 0);

  const lineRupture = d3.line()
    .x((d) => xScale(d.date))
    .y((d) => y(d.rupture))
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
    .attr("class", "chart-title")
    .attr("x", 10)
    .attr("y", 20)
    .attr("text-anchor", "start")
    .attr("fill", "var(--grisfonce)")
    .style("font-size", "15px")
    .style("font-weight", "500")
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
      .attr("class", "chart-subtitle")
      .attr("x", 10)
      .attr("y", 24 + bbox.height) // Position below the title with spacing
      .attr("text-anchor", "start")
      .attr("fill", "var(--grisleger)")
      .style("font-size", "11px")
      .style("font-weight", "400")
      .text("En nombre de spécialités (Codes CIS) manquantes le 1er de chaque période");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("rect")
    .attr("width", "100%")
    .attr("height", `${innerHeight}`)
    .attr("fill", "white");

  g.append("g")
    .attr("class", "x-axis-summary")
    .attr("transform", `translate(0, ${innerHeight})`)
    .call(xAxis);

  // Style yearly tick
  g.selectAll(".x-axis-summary .tick text")
    .filter((d) => d.getMonth() === 0)
    .style("font-weight", "bold")
    .style("font-size", "11px")
    .style("fill", "var(--grisfonce)");

  // Style month labels differently
  g.selectAll(".x-axis-summary .tick text")
    .filter((d) => d.getMonth() !== 0)
    .style("font-size", "10px")
    .style("fill", "var(--grisleger)");

  g.selectAll(".x-axis text")
    .style("font-size", `${labelFontSizeScale(windowWidth)}px`,
  );

  // Draw lines
  g.append("path")
    .datum(lineData)
    .attr("class", "tension-line")
    .attr("d", lineTension);

  g.append("path")
    .datum(lineData)
    .attr("class", "rupture-line")
    .attr("d", lineRupture);

  // Add marks (circles) for rupture data points - WITH FILTERING
  g.selectAll(".rupture-mark")
    .data(lineData.filter((d) => d.rupture > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
    .enter()
    .append("circle")
    .attr("class", "rupture-mark")
    .attr("cx", (d) => xScale(d.date))
    .attr("cy", (d) => y(d.rupture))
    .attr("r", 3)
    .style("fill", "var(--rupture)")
    .style("stroke", "white")
    .style("stroke-width", 0.5);

  // Add marks (circles) for tension data points - WITH FILTERING
  g.selectAll(".tension-mark")
    .data(lineData.filter((d) => d.tension > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
    .enter()
    .append("circle")
    .attr("class", "tension-mark")
    .attr("cx", (d) => xScale(d.date))
    .attr("cy", (d) => y(d.tension))
    .attr("r", 3)
    .style("fill", "var(--tension)")
    .style("stroke", "white")
    .style("stroke-width", 0.5);

  // Add labels for rupture data points - WITH FILTERING
  g.selectAll(".rupture-label")
    .data(lineData.filter((d) => d.rupture > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
    .enter()
    .append("text")
    .style("font-size", `${labelFontSizeScale(windowWidth)}px`)
    .attr("class", "rupture-label")
    .attr("x", (d) => xScale(d.date))
    .attr("y", (d) => y(d.rupture) - 10)
    .attr("text-anchor", "middle")
    .text((d) => d.rupture);

  // Add labels for tension data points - WITH FILTERING
  g.selectAll(".tension-label")
    .data(lineData.filter((d) => d.tension > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
    .enter()
    .append("text")
    .style("font-size", `${labelFontSizeScale(windowWidth)}px`)
    .attr("class", "tension-label")
    .attr("x", (d) => xScale(d.date))
    .attr("y", (d) => y(d.tension) - 10)
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
      // Add rupture point if there are ruptures
      if (currentMonthData.rupture > 0) {
        // Add larger circle for current rupture total
        g.append("circle")
          .attr("class", "current-point rupture-current")
          .attr("cx", xScale(dateReport))
          .attr("cy", y(currentMonthData.rupture))
          .attr("r", 2) // Larger than regular points
          .style("fill", "var(--rupture)")
          .style("stroke", "white")
          .style("stroke-width", 1);

        // Add special label for current rupture
        g.append("text")
          .attr("class", "current-label")
          .attr("x", xScale(dateReport) + 12)
          .attr("y", y(currentMonthData.rupture))
          .attr("text-anchor", "middle")
          .attr("font-weight", "bold")
          .style("fill", "var(--rupture)")
          .text(currentMonthData.rupture);
      }

      // Add tension point if there are tensions
      if (currentMonthData.tension > 0) {
        // Add larger circle for current tension total
        g.append("circle")
          .attr("class", "current-point tension-current")
          .attr("cx", xScale(dateReport))
          .attr("cy", y(currentMonthData.tension))
          .attr("r", 2) // Larger than regular points
          .style("fill", "var(--tension)")
          .style("stroke", "white")
          .style("stroke-width", 1);

        // Add special label for current tension
        g.append("text")
          .attr("class", "current-label")
          .attr("x", xScale(dateReport) + 12)
          .attr("y", y(currentMonthData.tension))
          .attr("text-anchor", "middle")
          .attr("font-weight", "bold")
          .style("fill", "var(--tension)")
          .text(currentMonthData.tension);
      }
    }
}

const legendData = [
    { label: "Rupture", color: "var(--rupture)" }, // Red
    { label: "Tension", color: "var(--tension)" }, // Orange
    { label: "Arrêt de commercialisation", color: "var(--arret-bg)" }, // Black
    { label: "Disponible", color: "var(--disponible)" } // Green
];

function createFloatingLegend() {
    const legendContainer = d3.select("#floating-legend");

    legendContainer
      .append("p")
      .attr("id", "title-legend")
      .text("Légende")

    const items = legendContainer.selectAll(".legend-item")
      .data(legendData)
      .enter()
      .append("div")
      .attr("class", "legend-item");

    items.append("div")
      .style("background-color", d => d.color)
      .style("width", "14px")
      .style("height", "14px")
      .style("display", "inline-block")
      .style("margin-right", "5px");

    items.append("span")
      .text(d => d.label)
}

createFloatingLegend();

/***************************/
/* Create the table chart  */
/***************************/
function drawTableChart(rawData, isInitialSetup, highlightedProducts = []) {
  const margin = { top: 0, right: 15, bottom: 0, left: 270 };
  const width = Math.min(900, windowWidth);
  const barHeight = 20;
  const labelMaxLength = 29;
  const statusBarWidth = 7;
  const statusBarSpacing = 5;
  const productsCount = dataManager.getProducts().length;
  const height = productsCount * barHeight;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const startDate = dataManager.getStartDate();
  const endDate = dataManager.getEndDate();
  const products = dataManager.getProducts();
  const accentedProducts = dataManager.getAccentedProducts();

  if (rawData.length === 0) {
    console.log("No data");
    return;
  }

  const xScale = d3.scaleTime()
    .domain([startDate, endDate])
    .range([0, innerWidth]);

  const yScale = d3.scaleBand()
    .domain(products)
    .range([0, innerHeight])
    .padding(0.1);

  let outerBox, innerChart;

  // Create tooltip if it doesn't exist
  let tooltip = d3.select("body").select("#tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div").attr("id", "tooltip");
  }

  // Create or update SVG
  if (isInitialSetup) {
    outerBox = d3.select("#dash")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    innerChart = outerBox.append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);
  } else {
    // Update existing SVG
    outerBox = d3.select("#dash svg")
      .attr("viewBox", `0, 0, ${width}, ${height}`);

    innerChart = d3.select("#dash svg g"); // Remove all existing elements
    innerChart.selectAll("*").remove();
  }

  // Y-AXIS
  // Add product names to the left of the chart
  let verticalTicks = width - margin.left;

  innerChart.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yScale).tickSize(-verticalTicks))
    .selectAll(".tick text")
    .style("font-size", `${fontSizeScale(windowWidth)}px`)
    .attr("x", -margin.left + statusBarWidth + statusBarSpacing)
    .style("text-anchor", "start")
    .text(function (d) {
      // Find the accented name corresponding to the product
      const accentedName = accentedProducts[products.indexOf(d)];
      return accentedName.length > labelMaxLength
        ? accentedName.substring(0, labelMaxLength) + "..."
        : accentedName;
    })
    .attr('class', 'product-label')
    .on("mouseover", function (event, d) {
      const product = rawData.find((item) => item.product === d);
      const accentedName = accentedProducts[products.indexOf(d)];
      const dateReport = dataManager.getDateReport();

      if (accentedName.length > labelMaxLength || product) {
        const status = getProductStatus(product);
        let tooltipContent = `<div class="tooltip-title">${accentedName}</div>`;
        tooltipContent += `<div class="tooltip-dci">DCI: ${product.molecule}</div>`;

        // Font Awesome icon for status
        const statusSymbol = `<span class=\"status-symbol\" aria-label=\"${status.text}\"><i class=\"${status.icon}\"></i></span>`;

        if (status.shorthand === "rupture" || status.shorthand === "tension") {
          if (product.start_date <= dateReport && product.calculated_end_date >= dateReport) {
            const diffInDays = Math.round((dateReport - product.start_date) / MS_IN_DAY);
            tooltipContent += `<div class=\"tooltip-status\" style=\"color:${status.color}; font-weight:600;\">${statusSymbol} ${status.text} depuis ${daysToYearsMonths(diffInDays)}</div>`;
          }
        } else {
          tooltipContent += `<div class=\"tooltip-status\" style=\"color:${status.color}; font-weight:600;\">${statusSymbol} ${status.text}</div>`;
        }

        // Afficher la liste des codes CIS
        if (Array.isArray(product.cis_codes) && product.cis_codes.length > 0) {
          tooltipContent += `<div class="tooltip-codesCIS">Codes CIS concernés :</div><ul>`;
          product.cis_codes.forEach(code => {
            const name = product.cis_names && product.cis_names[code] ? product.cis_names[code] : '';
            tooltipContent += `<li><strong>${code}</strong> : ${name}</li>`;
          });
          tooltipContent += `</ul>`;
        }

        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(tooltipContent).attr("class", status.class);

        // Anchor tooltip to the left of the chart area, top-aligned with the hovered label
        const labelBox = this.getBoundingClientRect();
        const tooltipNode = tooltip.node();
        let tooltipHeight = tooltipNode ? tooltipNode.offsetHeight : 120;
        let top = labelBox.top + window.scrollY;

        // Prevent top overflow
        if (top < 8) top = 8;
        // Prevent bottom overflow
        if (top + tooltipHeight + 8 > window.innerHeight + window.scrollY) {
          top = window.innerHeight + window.scrollY - tooltipHeight - 8;
        }

        tooltip.style('left', 0 + 'px').style('top', top + 'px');
      }
    })
    .on("mouseout", function () {
      tooltip.transition().duration(500).style("opacity", 0);
    });

  // EVENTS
  // Add bars for each event
  innerChart.selectAll("rect.bar")
      .data(rawData)
      .enter()
      .append("rect")
      .attr("class", (d) => `bar ${d.status}`.toLowerCase())
      .attr("x", (d) =>
        xScale(
          d.start_date > dataManager.getStartDate()
            ? d.start_date
            : dataManager.getStartDate(),
        ),
      )
      .attr(
        "y",
        (d) => yScale(d.product) + yScale.bandwidth() / 2 - barHeight / 2 - 1,
      )
      .attr("width", (d) => {
        const startDate = d.start_date;
        // Special handling for Arret status
        const endDate = d.status === "Arret" && !d.end_date
                      ? dataManager.getDateReport() // If Arret with no end_date, use report date
                      : d.calculated_end_date;

        const effectiveStartDate =
          startDate > dataManager.getStartDate() ? startDate : dataManager.getStartDate();
        return Math.max(0, xScale(endDate) - xScale(effectiveStartDate));
      })
      .attr("height", barHeight)
      .on("mousemove", function (event, d) {
        let statusClass = `tooltip-${d.status.toLowerCase()}`;
        let tooltipHTML;
        const dateReport = dataManager.getDateReport();
        const diffIndays = (startDate, endDate) =>
          Math.round((endDate - startDate) / MS_IN_DAY);

        // Special handling for Arret in tooltip
        if (d.status === "Arret") {
          if (d.end_date) {
            // Rare case: if Arret has an end_date
            tooltipHTML = tooltip.html(`
              <strong>${d.accented_product}</strong><br>
              <div class="tooltip-dci" style="margin-bottom: 8px;">DCI: ${d.molecule}</div>
              <strong>${d.status}</strong>, plus disponible de <strong>${formatDate(d.start_date)}</strong> jusqu'à <strong>${formatDate(d.end_date)}</strong>
            `);
          } else {
            // Normal case: Arret without end_date
            tooltipHTML = tooltip.html(`
              <strong>${d.accented_product}</strong><br>
              <div class="tooltip-dci" style="margin-bottom: 8px;">DCI: ${d.molecule}</div>
              <strong>${d.status}</strong>, plus disponible depuis le <strong>${formatDate(d.start_date)}</strong>
            `);
          }
        } else {
          if (formatDate(d.calculated_end_date) === formatDate(dateReport)) {
            tooltipHTML = tooltip.html(`
                <strong>${d.accented_product}</strong><br>
                <div class="tooltip-dci" style="margin-bottom: 8px;">DCI: ${d.molecule}</div>
                <strong>${d.status} / En cours</strong><br>
                Depuis le ${formatDate(d.start_date)} (${daysToYearsMonths(diffIndays(d.start_date, dateReport))})
              `);
          } else {
            tooltipHTML = tooltip.html(`
                <strong>${d.accented_product}</strong><br>
                <div class="tooltip-dci" style="margin-bottom: 8px;">DCI: ${d.molecule}</div>
                <span class="termine">${d.status} / Terminé</span><br>
                ${formatDate(d.start_date)} - ${formatDate(d.calculated_end_date)} (${daysToYearsMonths(diffIndays(d.start_date, d.calculated_end_date))})
              `);
          }
        }

        tooltipHTML.attr("class", statusClass)
          .style("left", 23 + "px")
          .style("top", event.pageY - 45 + "px")
          .style("opacity", 1);
      })
      .on("mouseout", function () {
        tooltip.style("opacity", 0);
      });

  // GRID
  // Add horizontal grid lines
  innerChart.selectAll(".grid-line")
    .data(dataManager.getProducts())
    .enter()
    .append("line")
    .attr("class", "grid-line")
    .attr("stroke", "var(--gristresleger")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", (d) => yScale(d) + yScale.bandwidth() + 1)
    .attr("y2", (d) => yScale(d) + yScale.bandwidth() + 1);

  innerChart.append("line")
    .attr("class", "grid-line")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", 1)
    .attr("y2", 1);

  // Add a single status circle for each product at the report date
  innerChart.selectAll("circle.status-circle")
      .data(dataManager.getProducts()) // Loop through all products
      .enter()
      .append("circle")
      .attr("cx", xScale(dataManager.getDateReport())) // Position at report date
      .attr("cy", (product) => yScale(product) + yScale.bandwidth() / 2) // Center vertically
      .attr("r", 5)
      .attr("class", (product) => {
        const productIncidents = rawData.filter((d) => d.product === product);
        if (productIncidents.length > 0) {
          const arretIncident = productIncidents.find(d =>
            d.status === "Arret" &&
            d.start_date <= dataManager.getDateReport() &&
            (!d.end_date || d.end_date >= dataManager.getDateReport())
          );

          if (arretIncident) {
            return "arret";
          }

          const status = getProductStatus(productIncidents[0]);
          return status.shorthand;
        }
        return "disponible";
      });

  // Add a status bar for each individual product
  innerChart.selectAll(".status-bar")
     .data(products)
     .enter()
     .append("rect")
     .attr("class", "status-bar")
     .attr("x", -margin.left)
     .attr("y", d => yScale(d))
     .attr("width", statusBarWidth)
     .attr("height", yScale.bandwidth() + 2)
     .attr("class", (product) => {
       const productIncidents = rawData.filter((d) => d.product === product);
       if (productIncidents.length > 0) {
         // Check if there's an active Arret incident at the report date
         const arretIncident = productIncidents.find(d =>
           d.status === "Arret" &&
           d.start_date <= dataManager.getDateReport() &&
           (!d.end_date || d.end_date >= dataManager.getDateReport())
         );

         if (arretIncident) {
           return "arret";
         }

         const status = getProductStatus(productIncidents[0]);
         return status.shorthand;
       }
       return "disponible";
     });

  const recentDays = 7;
  const dateReport = dataManager.getDateReport();

  // Find all incidents that started or ended recently
  const recentChanges = rawData.filter(d =>
    // Started recently
    (d.start_date >= new Date(dateReport - (recentDays * MS_IN_DAY)) &&
     d.start_date <= dateReport) ||
    // Or ended recently
    (d.end_date &&
     d.end_date >= new Date(dateReport - (recentDays * MS_IN_DAY)) &&
     d.end_date <= dateReport)
  );

  // Add indicators for each recent change
  recentChanges.forEach(incident => {
    // Determine if this is a start or end event
    const isStart = incident.start_date >= new Date(dateReport - (recentDays * MS_IN_DAY)) &&
                   incident.start_date <= dateReport;

    const date = isStart ? incident.start_date : incident.end_date;

    // For each incident, determine the current status and use its color
    const currentProduct = rawData.find(d =>
      d.product === incident.product &&
      d.start_date <= dateReport &&
      !d.end_date
    );

    // If we found the current status, use its color, otherwise default to availability color
    let statusColor = "var(--disponible)"; // Default to available
    let statusName = "Disponible";

    if (currentProduct) {
      if (currentProduct.status === "Rupture") {
        statusColor = "var(--rupture)";
        statusName = "Rupture";
      } else if (currentProduct.status === "Tension") {
        statusColor = "var(--tension)";
        statusName = "Tension";
      } else {
        statusColor = "var(--gris)";
        statusName = currentProduct.status;
      }
    }

    // Add the indicator circle
    innerChart.append("circle")
      .attr("class", "recent-change")
      .attr("cx", xScale(dateReport))
      .attr("cy", yScale(incident.product) + yScale.bandwidth() / 2)
      .attr("r", 4)
      .attr("fill", statusColor)
      .attr("stroke", statusColor)
      .attr("stroke-width", 2);
  });

  // Add vertical grid lines for years
  const yearTicks = xScale.ticks(d3.timeYear.every(1));

  // Add vertical lines for each year beginning
  innerChart.selectAll(".year-line")
    .data(yearTicks)
    .enter()
    .append("line")
    .attr("class", "year-line")
    .attr("x1", (d) => xScale(d))
    .attr("x2", (d) => xScale(d))
    .attr("y1", 0)
    .attr("y2", innerHeight);
}
