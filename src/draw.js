import { configManager } from './draw_config.js';
import {
  getProductStatus,
  getUniqueProductLength,
  createDebouncedSearch,
} from '../library/utils.js';

import { fetchTableChartData } from './fetch_data.js';

export async function handleSearch(searchTerm) {
  const monthsToShow = configManager.getMonthsToShow();
  const atcClass = configManager.getATCClass();
  const molecule = configManager.getMolecule();
  console.log('Searching for:', searchTerm);
  console.log('Searching for period:', monthsToShow);
  console.log('ATC Class:', atcClass);
  console.log('Molecule:', molecule);
  data = await fetchTableChartData(searchTerm, monthsToShow, atcClass, molecule);
  monthlyData = processDataMonthlyChart(data);
  drawTableChart(data, false);
  drawSummaryChart(monthlyData, false);
}

function updateMoleculeDropdown(atcClass) {
  const moleculeSelect = d3.select("#molecule");
  const { allMolecules, atcMoleculeMap } = window.atcData;

  let molecules = atcClass ? atcMoleculeMap[atcClass] || [] : allMolecules;

  moleculeSelect.selectAll("option")
    .data([{ id: "", name: "Choisir une molécule" }, ...molecules], d => d.id)
    .join("option")
    .attr("value", d => d.id)
    .text(d => d.name);

  configManager.setMolecule(""); // Reset molecule selection
}

// Set up debounced search to avoid querying too often
const debouncedSearch = createDebouncedSearch(handleSearch);

// Attach event listener to search box
d3.select("#search-box").on("input", function() {
  const searchTerm = this.value;
  configManager.setSearchTerm(this.value);
  console.log('Search term:', searchTerm); // For debugging
  debouncedSearch(searchTerm);
});

// Attach event listener to ATC class choice
d3.select("#atc").on("input", function() {
  // Only the ATC class code is returned as value is the code only
  const atcClass = this.value;
  configManager.setATCClass(atcClass);
  updateMoleculeDropdown(atcClass);
  debouncedSearch(configManager.getSearchTerm());
})

// Attach event listener to molecule choice
d3.select("#molecule").on("input", function() {
  // Only
  const molecule = this.value;
  configManager.setMolecule(molecule);
  console.log(molecule);
})

// Get all period buttons
const periodButtons = document.querySelectorAll('.chart-button');

// Function to highlight selected button and update chart
function selectButton(button, months) {
  periodButtons.forEach(btn => btn.classList.remove('button-selected'));
  button.classList.add('button-selected');
}

document.getElementById('show-12-months').addEventListener('click', function() {
  configManager.setMonthsToShow(12);
  handleSearch(configManager.getSearchTerm());
  selectButton(this, 12);
});

document.getElementById('show-24-months').addEventListener('click', function() {
  configManager.setMonthsToShow(24);
  handleSearch(configManager.getSearchTerm());
  selectButton(this, 24);
});

document.getElementById('show-all-data').addEventListener('click', function() {
  const end = new Date(configManager.getDateLastReport());
  const start = new Date(2021, 4, 1);
  const yearsFromStart = end.getFullYear() - start.getFullYear();
  const monthsFromStart = end.getMonth() - start.getMonth();
  const monthsDiff = (yearsFromStart) * 12 + monthsFromStart + 1;

  configManager.setMonthsToShow(monthsDiff);
  handleSearch(configManager.getSearchTerm());
  selectButton(this, monthsDiff);
});

// Set default to 12 months on page load
window.addEventListener('load', function() {
  const defaultButton = document.getElementById('show-12-months');
  selectButton(defaultButton, 12);
});

// Wait for the DOM to load
document.addEventListener('DOMContentLoaded', function() {
    // Select all checkboxes and add listener
    const checkboxes = d3.selectAll('input[type="checkbox"][name="atc"]');
    checkboxes.on('change', updateSelectedItems);

    function updateSelectedItems() {
      const checkedBoxes = d3.selectAll('input[type="checkbox"][name="atc"]:checked');

      // Get the selected ATC classes
      const selectedATCs = checkedBoxes.nodes().map(checkbox => {
        return {
          code: checkbox.value
        };
      });

        // Update the selected items list
        const selectedList = d3.select('#selected-atc-list');

        // Remove existing items
        selectedList.selectAll('li').remove();

        // Add new items
        selectedList.selectAll('li')
            .data(selectedATCs)
            .enter()
            .append('li')
            .text(d => `${d.code}`);
    }
});

let data = await fetchTableChartData();
let monthlyData = configManager.processDataMonthlyChart(data);
console.log(data);

drawTableChart(data, true);
drawSummaryChart(monthlyData, true);

function drawTableChart(data, isInitialSetup) {
  const { height, innerWidth, innerHeight } = configManager.getTableDimensions(configManager.getProducts().length);
  const dateLastReport = configManager.getDateLastReport();
  configManager.createScales(configManager.getStartDateChart(), configManager.getEndDateChart(), configManager.getProducts(), innerWidth, innerHeight);
  const xScale = configManager.getXScale();
  const yScale = configManager.getYScale();
  let outerBox, innerChart;

  // Création de la zone svg si elle n'existe pas
  if (isInitialSetup) {
    // Création initiale du SVG
    outerBox = d3.select("#dash")
      .append("svg")
        .attr("viewBox", `0, 0, ${configManager.config.table.width}, ${height}`)
        .attr("width", configManager.config.table.width)
        .attr("height", configManager.config.table.height);

    innerChart = outerBox
      .append("g")
        .attr("transform", `translate(${configManager.config.table.margin.left}, ${configManager.config.table.margin.top})`);

  } else {  // Mise à jour du SVG existant
    outerBox = d3.select("#dash svg")
      .attr("viewBox", `0, 0, ${configManager.config.table.width}, ${height}`)
      .attr("height", height);

    innerChart = d3.select("#dash svg g"); // Remove all existing elements
    innerChart.selectAll("*").remove();
  }

  // EVENTS
  // Ajout des barres de chaque événement
  innerChart.selectAll("rect.bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", d => `bar ${d.status}`)
    .attr("x", d => xScale(d.start_date > configManager.getStartDateChart() ? d.start_date : configManager.getStartDateChart()))
    .attr("y", d => yScale(d.product) + yScale.bandwidth() / 2 - configManager.config.table.barHeight / 2 - 1)
    .attr("width", d => {
      const startDate = d.start_date;
      const endDate = d.calculated_end_date;
      const effectiveStartDate = startDate > configManager.getStartDateChart() ? startDate : configManager.getStartDateChart();
      return Math.max(0, xScale(endDate) - xScale(effectiveStartDate));
    })
    .attr("height", configManager.config.table.barHeight)
    .on("mouseover", function(event, d) {
      let statusClass = `tooltip-${d.status.toLowerCase()}`;
      tooltip.html(`
        <strong>Produit:</strong> ${d.product}<br>
        <strong>Incident:</strong> ${d.status}<br>
        <strong>Début:</strong> ${d3.timeFormat("%d/%m/%Y")(d.start_date)}<br>
        <strong>Fin:</strong> ${d3.timeFormat("%d/%m/%Y")(d.calculated_end_date)}
      `)
      .attr("class", statusClass)
      .style("opacity", 0.9)
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      tooltip.style("opacity", 0);
    });

  // X-AXIS
  // Top X Axis for years
  const yearAxis = innerChart
    .append("g")
      .attr("transform", `translate(0,-20)`) // Position for the year axis
      .call(d3.axisTop(xScale)
        .ticks(d3.timeYear.every(1))
        .tickFormat(d3.timeFormat("%Y"))
        .tickSize(20)
      );

  // Add a class of year-tick
  yearAxis.selectAll(".tick")
    .attr("class", "year-tick");

  // Center the year labels between the ticks
  yearAxis.selectAll("text")
    .attr("x", function(d, i, nodes) {
        const nextTick = i < nodes.length - 1 ? xScale(d3.timeYear.offset(d, 1)) : xScale.range()[1];
        return (nextTick - xScale(d)) / 2;
      })
    .style("text-anchor", "middle");

  // Top X Axis for months
  const monthAxis = innerChart
    .append("g")
      .attr("transform", `translate(0, -20)`) // Adjust position to place it below the year axis
      .call(d3.axisTop(xScale)
        .ticks(d3.timeMonth.every(1))
        .tickFormat(d3.timeFormat("%-m"))
        .tickSize(20)
      );

  // Center the month labels between the ticks
  monthAxis.selectAll("text")
    .attr("transform", function(d, i, nodes) {
        const nextTick = i < nodes.length - 1 ? xScale(d3.timeMonth.offset(d, 1)) : xScale.range()[1];
        return `translate(${(nextTick - xScale(d)) / 2}, 17)`;
      })
    .style("text-anchor", "middle");

  // Add a class of year-tick
  monthAxis.selectAll(".tick")
    .attr("class", "month-tick");

  // Adjust x-axis position
  yearAxis.attr("transform", `translate(0,-20)`);
  monthAxis.attr("transform", `translate(0,0)`);

  // Create tooltip div if it doesn't exist
  let tooltip = d3.select("body").select("#tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("id", "tooltip");
  }

  // Y-AXIS
  // Produits
  innerChart
    .append("g")
    .call(d3.axisLeft(yScale).tickSize(0))
    .selectAll(".tick text")
    .attr("x", - configManager.config.table.margin.left + configManager.config.table.statusBarWidth + configManager.config.table.statusBarSpacing)
    .style("text-anchor", "start")
    .text(function(d) {
      return d.length > configManager.config.table.labelMaxLength ? d.substring(0, configManager.config.table.labelMaxLength) + "..." : d;
    })
    .on("mouseover", function(event, d) {
      const product = data.find(item => item.product === d);
      if (d.length > configManager.config.table.labelMaxLength || product) {
        const status = getProductStatus(product);
        const tooltip = d3.select("#tooltip");
        tooltip.transition().duration(200).style("opacity", 0.9);
        tooltip.html(`
          <strong>Produit:</strong> ${d}<br>
          <strong>Statut:</strong> ${status.text}
        `)
          .attr("class", status.class)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
        }
      })
      .on("mouseout", function() {
          d3.select("#tooltip").transition().duration(500).style("opacity", 0);
      });

  // GRID
  // Add horizontal grid lines manually after bars to ensure they are on top
  innerChart.selectAll(".grid-line")
    .data(configManager.getProducts())
    .enter()
    .append("line")
      .attr("class", "grid-line")
      .attr("x1", -configManager.config.table.margin.left)
      .attr("x2", innerWidth)
      .attr("y1", d => yScale(d) + yScale.bandwidth())
      .attr("y2", d => yScale(d) + yScale.bandwidth())

  // Add vertical grid lines for months and years
  const monthTicks = xScale.ticks(d3.timeMonth.every(1));
  const yearTicks = xScale.ticks(d3.timeYear.every(1));

  // Add horizontal line on top of products
  innerChart.append("line")
    .attr("class", "year-line")
    .attr("x1", -configManager.config.table.margin.left)
    .attr("x2", 0)
    .attr("y1", 0)
    .attr("y2", 0)

  // Add vertical lines for each month beginning
  innerChart.selectAll(".month-line")
    .data(monthTicks)
    .enter()
    .append("line")
      .attr("class", "month-line")
      .attr("x1", d => xScale(d))
      .attr("x2", d => xScale(d))
      .attr("y1", 0)
      .attr("y2", innerHeight)

  // Add vertical lines for each year beginning
  innerChart.selectAll(".year-line")
    .data(yearTicks)
    .enter()
    .append("line")
    .attr("class", "year-line")
    .attr("x1", d => xScale(d))
    .attr("x2", d => xScale(d))
    .attr("y1", 0)
    .attr("y2", innerHeight);

  // Add an additional vertical line at the end of the x-axis
  innerChart.append("line")
    .attr("class", "end-line")
    .attr("x1", innerWidth)
    .attr("x2", innerWidth)
    .attr("y1", 0)
    .attr("y2", innerHeight);

  // Add the last line of the reports
  innerChart.append("line")
    .attr("class", "current-date-line")
    .attr("x1", xScale(dateLastReport))
    .attr("x2", xScale(dateLastReport))
    .attr("y1", 0)
    .attr("y2", innerHeight);


  // Add status bars on the left of the chart
  const groupedData = d3.group(data, d => getProductStatus(d).text);
  const statusColors = {
    "Rupture de stock": "var(--rupture)",
    "Tension d'approvisionnement": "var(--tension)",
    "Arrêt de commercialisation": "var(--gris)",
    "Disponible": "var(--disponible-bg)"
  };

  // Used to get the height of the chart (variable to products)
  const totalProductLength = getUniqueProductLength(data);
  let accumulatedHeight = 0;
  let productLeft = totalProductLength;

  groupedData.forEach((group, status) => {
    const productLength = getUniqueProductLength(group);
    let groupHeight;

    if (status === "Disponible") {
      groupHeight = productLeft * configManager.config.table.barHeight;
    } else {
      groupHeight = productLength * configManager.config.table.barHeight;
    }

    innerChart.append("rect")
      .attr("class", "status-bar")
      .attr("x", -configManager.config.table.margin.left)
      .attr("y", accumulatedHeight)
      .attr("width", configManager.config.table.statusBarWidth)
      .attr("height", groupHeight)
      .attr("fill", statusColors[status]);
    accumulatedHeight += groupHeight;
    productLeft -= productLength;
  });
}

function drawSummaryChart(monthlyChartData, isInitialSetup) {
  const { innerWidth, innerHeight } = configManager.getSummaryChartDimensions();
  const margin = configManager.config.summaryChart.margin;

  // Parse dates
  const parseDate = d3.timeParse("%Y-%m-%d");
  monthlyChartData.forEach(d => {
    d.date = parseDate(d.date);
  });

  // Filter out months with no data
  const filteredData = monthlyChartData.filter(d => d.rupture > 0 || d.tension > 0);

  // Create scales
  const xScale = configManager.getXScale();

  const y = d3.scaleLinear()
    .domain([0, d3.max(filteredData, d => Math.max(d.rupture, d.tension))])
    .nice()
    .range([innerHeight, 0]);

  // Create line generators
  const lineRupture = d3.line()
    .x(d => xScale(d.date))
    .y(d => y(d.rupture))
    .defined(d => d.rupture > 0);

  const lineTension = d3.line()
    .x(d => xScale(d.date))
    .y(d => y(d.tension))
    .defined(d => d.tension > 0);

  // Create SVG
  let svg;
  if (isInitialSetup) {
    svg = d3.select("#summary")
      .append("svg")
      .attr("width", configManager.config.summaryChart.width)
      .attr("height", configManager.config.summaryChart.height);
  } else {
    svg = d3.select("#summary svg");
    svg.selectAll("*").remove();
  }

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Draw lines
  g.append("path")
    .datum(filteredData)
    .attr("class", "tension-line")
    .attr("d", lineRupture);

  g.append("path")
    .datum(filteredData)
    .attr("class", "tension-line")
    .attr("d", lineTension);

  // Create area generators
  const areaRupture = d3.area()
    .x(d => xScale(d.date))
    .y0(innerHeight)
    .y1(d => y(d.rupture))
    .defined(d => d.rupture > 0);

  const areaTension = d3.area()
    .x(d => xScale(d.date))
    .y0(innerHeight)
    .y1(d => y(d.tension))
    .defined(d => d.tension > 0);

  // Draw areas
  g.append("path")
    .datum(filteredData)
    .attr("class", "area rupture-area")
    .attr("d", areaRupture);

  g.append("path")
    .datum(filteredData)
    .attr("class", "area tension-area")
    .attr("d", areaTension);

  // Add data points and labels
  g.selectAll(".rupture-point")
    .data(filteredData.filter(d => d.rupture > 0))
    .enter()
    .append("circle")
    .attr("class", "rupture-point")
    .attr("cx", d => xScale(d.date))
    .attr("cy", d => y(d.rupture))
    .attr("r", 2);

  g.selectAll(".rupture-label")
    .data(filteredData.filter(d => d.rupture > 0))
    .enter()
    .append("text")
    .attr("class", "rupture-label")
    .attr("x", d => xScale(d.date))
    .attr("y", d => y(d.rupture) - 10)
    .attr("text-anchor", "middle")
    .text(d => d.rupture);

  g.selectAll(".tension-point")
    .data(filteredData.filter(d => d.tension > 0))
    .enter()
    .append("circle")
    .attr("class", "tension-point")
    .attr("cx", d => xScale(d.date))
    .attr("cy", d => y(d.tension))
    .attr("r", 2);

  g.selectAll(".tension-label")
    .data(filteredData.filter(d => d.tension > 0))
    .enter()
    .append("text")
    .attr("class", "tension-label")
    .attr("x", d => xScale(d.date))
    .attr("y", d => y(d.tension) - 10)
    .attr("text-anchor", "middle")
    .text(d => d.tension);

  g.append("line")
     .attr("x1", 0)
     .attr("y1", innerHeight)
     .attr("x2", innerWidth)
     .attr("y2", innerHeight)
     .attr("stroke", "black")
     .attr("stroke-width", 1);
}
