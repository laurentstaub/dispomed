import { config } from "./draw_config.js";
import { fetchTableChartData } from "./fetch_data.js";
const HOURS_IN_DAY = 24;
const MINS_IN_HOUR = 60;
const SECS_IN_MIN = 60;
const MS_IN_SEC = 1000;
const MS_IN_DAY = HOURS_IN_DAY * MINS_IN_HOUR * SECS_IN_MIN * MS_IN_SEC;
const ALL_TIME_START = new Date(2021, 4, 1);

const frFr = d3.timeFormatLocale({
  dateTime: "%A %e %B %Y à %X",
  date: "%d/%m/%Y",
  time: "%H:%M:%S",
  periods: ["", ""],
  days: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  shortDays: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
  months: ["janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  shortMonths: ["Q1", "", "", "Q2", "", "", "Q3", "", "", "Q4", "", ""],
});

const formatDate = frFr.format("%e %B %Y");
const formatDateShort = frFr.format("%b");

const fontSizeScale = d3.scaleLinear()
  .domain([400, 900])
  .range([26, 14])
  .clamp(true);

const labelFontSizeScale = d3.scaleLinear()
  .domain([400, 900])
  .range([18, 11])
  .clamp(true);

const barHeightScale = d3.scaleLinear()
  .domain([400, 900])
  .range([30, 18])
  .clamp(true);

let windowWidth = getWindowWidth();
let isDesktopLayout = windowWidth >= 700 ? true : false;

function getWindowWidth() {
  return window.innerWidth;
}

function getProductStatus(d) {
  const dateReport = config.getDateReport();

  if (d.status === "arret") {
    return { text: "Arrêt de commercialisation", class: "tooltip-arret" };
  } else if (
    d.start_date <= dateReport &&
    d.calculated_end_date >= dateReport
  ) {
    if (d.status === "Rupture") {
      return { text: "Rupture de stock", class: "tooltip-rupture" };
    } else if (d.status === "Tension") {
      return { text: "Tension d'approvisionnement", class: "tooltip-tension" };
    } else if (d.status === "Arret") {
      return { text: "Arrêt de commercialisation", class: "tooltip-arret" };
    }
  } else if (!d.calculated_end_date || d.calculated_end_date < dateReport) {
    return { text: "Disponible", class: "tooltip-disponible" };
  }
  return { text: "Statut inconnu", class: "" };
}

// Used to get the unique product list from the SQL query
function getUniqueProductLength(eventList) {
  let result = [];

  eventList.forEach((event) => {
    if (!result.includes(event.product)) result.push(event.product);
  });

  return result.length;
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

function updateChartDimensions() {
  const styles = getComputedStyle(document.documentElement);

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
  const monthsToShow = config.getMonthsToShow();
  const atcClass = config.getATCClass();
  const molecule = config.getMolecule();

  data = await fetchTableChartData(
    isInitialSetup, monthsToShow, searchTerm, atcClass, molecule,
  );
  monthlyData = config.processDataMonthlyChart(data);
  drawTableChart(data, false);
  drawSummaryChart(monthlyData, false);
  updateMoleculeDropdown(atcClass);
}

function updateMoleculeDropdown(atcClass) {
  const moleculeSelect = d3.select("#molecule");
  const selectedMoleculeId = config.getMolecule();
  let rawMolecules = config.getMoleculeClassMap();

  if (atcClass !== "") {
    rawMolecules = rawMolecules.filter((mol) => mol.atcClass === atcClass);
  }

  const molecules = rawMolecules.map((mol) => {
    return { code: mol.moleculeId, name: mol.moleculeName };
  });

  moleculeSelect.selectAll("option")
    .data([{ code: "", name: "Choisir une molécule" }, ...molecules])
    .join("option")
    .attr("value", d => d.code)
    .text(d => d.name)
    .selectAll("option")
    .attr("selected", null);

  if (selectedMoleculeId) {
    moleculeSelect.selectAll(`option[value='${selectedMoleculeId}']`)
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
    updateChartDimensions();
    monthlyData = config.processDataMonthlyChart(data);
    drawTableChart(data, false);
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
  const searchTerm = this.value;
  config.setSearchTerm(this.value);
  debouncedSearch(false, searchTerm);
});

d3.select("#atc").on("input", function () {
  config.setATCClass(this.value);
  config.setMolecule("");
  d3.select("#molecule").property("value", "").dispatch("change");

  handleSearch(false, config.getSearchTerm());
});

d3.select("#molecule").on("input", function () {
  const molecule = this.value;
  config.setMolecule(molecule);
  handleSearch(false, config.getSearchTerm());
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
  config.setMonthsToShow(12);
  handleSearch(true, config.getSearchTerm());
  selectButton(this);
});

d3.select("#show-24-months").on("click", function () {
  config.setMonthsToShow(24);
  handleSearch(true, config.getSearchTerm());
  selectButton(this);
});

document.getElementById("show-all-data").addEventListener("click", function () {
  const end = new Date(config.getDateReport());
  const start = ALL_TIME_START;
  const yearsFromStart = end.getFullYear() - start.getFullYear();
  const monthsFromStart = end.getMonth() - start.getMonth();
  const monthsDiff = yearsFromStart * 12 + monthsFromStart + 1;

  config.setMonthsToShow(monthsDiff);
  handleSearch(config.getSearchTerm());
  selectButton(this);
});

// Set default to 12 months button on page load
window.addEventListener("load", function () {
  const defaultButton = document.getElementById("show-12-months");
  selectButton(defaultButton);
});

let data = await fetchTableChartData(true);
let monthlyData = config.processDataMonthlyChart(data);

d3.select("#last-report-date").text(
  `Ruptures et tensions des médicaments (MITM) - ${formatDate(config.getDateReport())}`,
);
drawTableChart(data, true);
drawSummaryChart(monthlyData, true);

/***********************************/
/*    Draw the top summary chart   */
/***********************************/
function drawSummaryChart(monthlyChartData, isInitialSetup) {
  const margin = { top: 40, right: 0, bottom: 50, left: 10 };
  const height = 290;
  const width = 600;
  const innerHeight = height - margin.top - margin.bottom;
  const innerWidth = width - margin.left;

  const startDate = config.getStartDate();
  const endDate = config.getEndDate();

  // Parse dates
  const parseDate = d3.timeParse("%Y-%m-%d");
  monthlyChartData.forEach(d => d.date = parseDate(d.date));

  // Filter out months with no data
  const filteredData = monthlyChartData.filter(d => d.rupture > 0 || d.tension > 0);

  // Create scales
  const xScale = d3.scaleTime()
    .domain([startDate, endDate])
    .range([0, innerWidth]);;

  const y = d3.scaleLinear()
    .domain([0, d3.max(filteredData, d => Math.max(d.rupture, d.tension))])
    .nice()
    .range([innerHeight, 0]);

  const xAxis = d3.axisBottom(xScale)
    .ticks(d3.timeMonth.every(1))
    .tickFormat(d => d.getMonth() === 0 ? d3.timeFormat("%Y")(d) : formatDateShort(d))
    .tickSize(3);

  // Create line generators
  const lineTension = d3.line()
    .x(d => xScale(d.date))
    .y(d => y(d.tension))
    .defined(d => d.tension > 0);

  const lineRupture = d3.line()
    .x(d => xScale(d.date))
    .y(d => y(d.rupture))
    .defined(d => d.rupture > 0);

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

  svg.append("rect")
    .attr("class", "title-background")
    .attr("x", margin.left)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", margin.top)
    .attr("fill", "white");

  svg.append("text")
    .attr("class", "chart-title")
    .attr("x", width / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .attr("fill", "grey")
    .style("font-size", "14px")
    .text("Nombre de Ruptures et Tensions");

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("rect")
      .attr("width", "100%")
      .attr("height", `${innerHeight}`)
      .attr("fill", "white");

  g.append("g")
    .attr("class", "x-axis top-axis")
    .attr("transform", `translate(0, ${innerHeight})`)
    .call(xAxis);

  g.selectAll(".x-axis text")
    .style("font-size", `${labelFontSizeScale(windowWidth)}px`);

  // Draw lines
  g.append("path")
    .datum(filteredData)
    .attr("class", "tension-line")
    .attr("d", lineTension);

  g.append("path")
    .datum(filteredData)
    .attr("class", "rupture-line")
    .attr("d", lineRupture);

  g.selectAll(".rupture-label")
    .data(filteredData.filter(d => d.rupture > 0))
    .enter()
    .append("text")
      .style("font-size", `${labelFontSizeScale(windowWidth)}px`)
      .attr("class", "rupture-label")
      .attr("x", d => xScale(d.date))
      .attr("y", d => y(d.rupture) - 10)
      .attr("text-anchor", "middle")
      .text(d => d.rupture);

  g.selectAll(".tension-label")
    .data(filteredData.filter(d => d.tension > 0))
    .enter()
    .append("text")
      .style("font-size", `${labelFontSizeScale(windowWidth)}px`)
      .attr("class", "tension-label")
      .attr("x", d => xScale(d.date))
      .attr("y", d => y(d.tension) - 10)
      .attr("text-anchor", "middle")
      .text(d => d.tension);
}

/***************************/
/* Create the table chart  */
/***************************/
function drawTableChart(data, isInitialSetup) {
  const margin = { top: 0, right: 0, bottom: 0, left: 270 };
  const width = 900;
  const barHeight = barHeightScale(windowWidth);
  const labelMaxLength = 32;
  const statusBarWidth = 3;
  const statusBarSpacing = 5;
  const productsCount = config.getProducts().length;
  const height = productsCount * barHeight;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const startDate = config.getStartDate();
  const endDate = config.getEndDate();
  const products = config.getProducts();

  const xScale = d3.scaleTime()
    .domain([startDate, endDate])
    .range([0, innerWidth]);

  const yScale = d3.scaleBand()
    .domain(products)
    .range([0, innerHeight])
    .padding(0.1);

  let outerBox, innerChart;

  // Création de la zone svg si elle n'existe pas
  if (isInitialSetup) {
    // Création initiale du SVG
    outerBox = d3.select("#dash")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    innerChart = outerBox
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);
  } else {
    // Mise à jour du SVG existant
    outerBox = d3.select("#dash svg")
      .attr("viewBox", `0, 0, ${width}, ${height}`);

    innerChart = d3.select("#dash svg g"); // Remove all existing elements
    innerChart.selectAll("*").remove();
  }

  // Y-AXIS
  // Add Produits to the left of the chart
  let verticalTicks = width - margin.left;

  innerChart
    .append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yScale).tickSize(-verticalTicks))
    .selectAll(".tick text")
    .style("font-size", `${fontSizeScale(windowWidth)}px`)
    .attr("x", - margin.left + statusBarWidth + statusBarSpacing)
    .style("text-anchor", "start")
    .text(function (d) {
      return d.length > labelMaxLength
        ? d.substring(0, labelMaxLength) + "..." : d;
    })
    .on("mouseover", function (event, d) {
      const product = data.find((item) => item.product === d);
      if (d.length > labelMaxLength || product) {
        const status = getProductStatus(product);
        const tooltip = d3.select("#tooltip");
        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(`
            ${d}<br>
            Ce produit est en <strong>${status.text}</strong>`)
          .attr("class", status.class)
          .style("left", event.pageX - 160 + "px")
          .style("top", event.pageY - 80 + "px");
      }
    })
    .on("mouseout", function () {
      d3.select("#tooltip").transition().duration(500).style("opacity", 0);
    });

  // EVENTS
  // Ajout des barres de chaque événement
  innerChart
    .selectAll("rect.bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", d => `bar ${d.status}`.toLowerCase())
    .attr("x", d =>
      xScale(d.start_date > config.getStartDate()
          ? d.start_date : config.getStartDate()))
    .attr(
      "y", d => yScale(d.product) + yScale.bandwidth()/2 - barHeight/2 - 1,
    )
    .attr("width", d => {
      const startDate = d.start_date;
      const endDate = d.calculated_end_date;
      const effectiveStartDate = startDate > config.getStartDate()
          ? startDate : config.getStartDate();
      return Math.max(0, xScale(endDate) - xScale(effectiveStartDate));
    })
    .attr("height", barHeight)
    .on("mousemove", function (event, d) {
      let statusClass = `tooltip-${d.status.toLowerCase()}`;
      let tooltipHTML;
      const dateReport = config.getDateReport();
      const diffIndays = (startDate, endDate) =>
        Math.round((endDate - startDate) / MS_IN_DAY);

      if (statusClass === "tooltip-arret") {
        tooltipHTML = tooltip.html(`
            <strong>${d.status}</strong>, plus disponible depuis le <strong>${formatDate(d.start_date)}</strong><br>
            ${d.product}<br>
          `);
      } else {
        if (formatDate(d.calculated_end_date) === formatDate(dateReport)) {
          tooltipHTML = tooltip.html(`
              <strong>${d.status} / En cours</strong><br>
              ${d.product}<br>
              Depuis le ${formatDate(d.start_date)} (${diffIndays(d.start_date, dateReport)} jours)
            `);
        } else {
          tooltipHTML = tooltip.html(`
              <span class="termine">${d.status} / Terminé</span><br>
              ${d.product}<br>
              ${formatDate(d.start_date)} - ${formatDate(d.calculated_end_date)} (${diffIndays(d.start_date, d.calculated_end_date)} jours)
            `);
        }
      }

      tooltipHTML.attr("class", statusClass)
        .style("left", d3.pointer(event)[0] + 360 + "px")
        .style("top", d3.pointer(event)[1] + 350 + "px")
        .style("opacity", 0.9);
    })
    .on("mouseout", function () { tooltip.style("opacity", 0); });

  // Create tooltip div if it doesn't exist
  let tooltip = d3.select("body").select("#tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div").attr("id", "tooltip");
  }

  // GRID
  // Add horizontal grid lines
  innerChart.selectAll(".grid-line")
    .data(config.getProducts())
    .enter()
    .append("line")
      .attr("class", "grid-line")
      .attr("stroke", "var(--gristresleger")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", d => yScale(d) + yScale.bandwidth() + 1)
      .attr("y2", d => yScale(d) + yScale.bandwidth() + 1);

  innerChart
    .append("line")
      .attr("class", "grid-line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", 1)
      .attr("y2", 1);

  // Add vertical grid lines for years
  const yearTicks = xScale.ticks(d3.timeYear.every(1));

  // Add vertical lines for each year beginning
  innerChart
    .selectAll(".year-line")
    .data(yearTicks)
    .enter()
    .append("line")
      .attr("class", "year-line")
      .attr("x1", d => xScale(d))
      .attr("x2", d => xScale(d))
      .attr("y1", -height)
      .attr("y2", innerHeight);

  // Add status bars on the left of the chart
  const groupedData = d3.group(data, d => getProductStatus(d).text);
  const statusColors = {
    "Rupture de stock": "var(--rupture)",
    "Tension d'approvisionnement": "var(--tension)",
    "Arrêt de commercialisation": "var(--gris)",
    Disponible: "var(--disponible)",
  };

  // Used to get the height of the chart (variable to products)
  const totalProductLength = getUniqueProductLength(data);
  let accumulatedHeight = 0;
  let productLeft = totalProductLength;

  groupedData.forEach((group, status) => {
    const productLength = getUniqueProductLength(group);
    let groupHeight;

    if (status === "Disponible") {
      groupHeight = productLeft * barHeight;
    } else {
      groupHeight = productLength * barHeight;
    }

    innerChart
      .append("rect")
      .attr("class", "status-bar")
      .attr("x", -margin.left)
      .attr("y", accumulatedHeight)
      .attr("width", statusBarWidth)
      .attr("height", groupHeight)
      .attr("fill", statusColors[status]);

    accumulatedHeight += groupHeight;
    productLeft -= productLength;
  });
}
