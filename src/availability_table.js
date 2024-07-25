import {
  tableConfig,
  getChartDimensions,
  setProducts,
  getProducts,
  createScales,
  getXScale,
  getYScale,
  processDataMonthlyChart,
} from './availability_config.js';

import {
  customSort,
  getProductStatus,
  hasEventInChartPeriod,
  getUniqueProductLength,
  processDates,
  createDebouncedSearch
} from '/library/utils.js';

let monthlyChartData;
const debouncedFetchFilteredData = createDebouncedSearch(fetchFilteredData);

d3.select("#search-box").on("input", function() {
  debouncedFetchFilteredData(this.value);
});

// Initial data fetch
fetchAndProcessData('', true);

// For filtered data (to be used with the search input)
export function fetchFilteredData(searchTerm) {
  fetchAndProcessData(searchTerm, false);
}

// Mise à jour des variables globales générales du graphique
function updateVariables(data) {
  setProducts(data);
  const { innerWidth, innerHeight } = getChartDimensions(getProducts().length);
  const endDateChart = tableConfig.getEndDateChart();
  createScales(tableConfig.startDateChart, endDateChart, getProducts(), innerWidth, innerHeight);
}

function fetchAndProcessData(searchTerm = '', isInitialSetup = false) {
  const queryString = searchTerm ? new URLSearchParams({ product: searchTerm }).toString() : '';
  const url = `/api/incidents${queryString ? '?' + queryString : ''}`;

  fetch(url)
    .then(response => response.json())
    .then(data => {
      console.log(data);
      const processedData = processDates(data);

      if (isInitialSetup) {
        tableConfig.setEndDateChart(new Date(d3.max(processedData, d => d.end_date).getFullYear(), 11, 31));
        tableConfig.setDateLastReport(d3.max(processedData, d => d.end_date));
      }

      const periodFilteredData = processedData
        .filter(hasEventInChartPeriod)
        .sort(customSort);
      monthlyChartData = processDataMonthlyChart(periodFilteredData);
      console.log(monthlyChartData);

      updateVariables(periodFilteredData);
      drawBarChart(periodFilteredData, isInitialSetup);
      drawSummaryChart(monthlyChartData, isInitialSetup);
    })
    .catch(error => console.error('Error:', error));
}

function drawSummaryChart(monthlyChartData, isInitialSetup) {
  const width = 1000;
  const height = 300;
  const margin = { top: 20, right: 20, bottom: 40, left: 300 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Create scales
  const x = d3.scaleBand()
    .domain(monthlyChartData.map(d => d.date))
    .range([0, innerWidth])
    .padding(0.1);

  const y = d3.scaleLinear()
    .domain([0, d3.max(monthlyChartData, d => d.rupture + d.tension)])
    .range([innerHeight, 0]);

  const color = d3.scaleOrdinal()
    .domain(["rupture", "tension"])
    .range(["#d53e4f", "#ff8c00"]);

  // Create SVG
  let svg;
  if (isInitialSetup) {
    svg = d3.select("#summary")
      .append("svg")
      .attr("width", width)
      .attr("height", height);
  } else {
    svg = d3.select("#summary svg");
    svg.selectAll("*").remove();
  }

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Create stacked data
  const stack = d3.stack()
    .keys(["rupture", "tension"])
    .order(d3.stackOrderNone)
    .offset(d3.stackOffsetNone);

  const stackedData = stack(monthlyChartData);

  // Draw bars
  g.selectAll("g")
    .data(stackedData)
    .join("g")
      .attr("fill", d => color(d.key))
    .selectAll("rect")
    .data(d => d)
    .join("rect")
      .attr("x", d => x(d.data.date))
      .attr("y", d => y(d[1]))
      .attr("height", d => y(d[0]) - y(d[1]))
      .attr("width", x.bandwidth());

  // Add x-axis
  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b %Y")))
    .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

  // Add y-axis
  g.append("g")
    .call(d3.axisLeft(y));

  // Add legend
  const legend = svg.append("g")
    .attr("font-family", "sans-serif")
    .attr("font-size", 10)
    .attr("text-anchor", "end")
    .selectAll("g")
    .data(color.domain().slice().reverse())
    .join("g")
      .attr("transform", (d, i) => `translate(0,${i * 20})`);

  legend.append("rect")
    .attr("x", width - 19)
    .attr("width", 19)
    .attr("height", 19)
    .attr("fill", color);

  legend.append("text")
    .attr("x", width - 24)
    .attr("y", 9.5)
    .attr("dy", "0.32em")
    .text(d => d.charAt(0).toUpperCase() + d.slice(1));
};

function drawBarChart(data, isInitialSetup) {
  const { height, innerWidth, innerHeight } = getChartDimensions(getProducts().length);
  const dateLastReport = tableConfig.getDateLastReport();
  const xScale = getXScale();
  const yScale = getYScale();
  let outerBox, innerChart;

  // Création de la zone svg si elle n'existe pas
  if (isInitialSetup) {
    // Création initiale du SVG
    outerBox = d3.select("#dash")
      .append("svg")
        .attr("viewBox", `0, 0, ${tableConfig.width}, ${height}`)
        .attr("width", tableConfig.width)
        .attr("height", tableConfig.height);

    innerChart = outerBox
      .append("g")
        .attr("transform", `translate(${tableConfig.margin.left}, ${tableConfig.margin.top})`);

    // Ajoutez ceci après la création du SVG et de innerChart
    const title = outerBox.append("text")
      .attr("class", "chart-title")
      .attr("x", 0)
      .attr("y", 10)
      .attr("text-anchor", "left")
      .style("font-size", "14px")
      .style("font-weight", "bold");
  } else {  // Mise à jour du SVG existant
    outerBox = d3.select("#dash svg")
      .attr("viewBox", `0, 0, ${tableConfig.width}, ${height}`)
      .attr("height", height);

    innerChart = d3.select("#dash svg g"); // Remove all existing elements
    innerChart.selectAll("*").remove();
  }

  const formatDate = d3.timeFormat("%d/%m/%Y");
    outerBox.select(".chart-title")
      .text(`Date du dernier rapport : ${formatDate(tableConfig.getDateLastReport())}`);

  innerChart.append("rect")
    .attr("class", "x-top-background")
    .attr("x", 0)
    .attr("y", - tableConfig.margin.top + 10)
    .attr("width", innerWidth)
    .attr("height", tableConfig.margin.top - 10);

  // EVENTS
  // Ajout des barres de chaque événement
  innerChart.selectAll("rect.bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", d => `bar ${d.status}`)
    .attr("x", d => xScale(d.start_date > tableConfig.startDateChart ? d.start_date : tableConfig.startDateChart))
    .attr("y", d => yScale(d.product) + yScale.bandwidth() / 2 - tableConfig.barHeight / 2 - 1)
    .attr("width", d => {
      const startDate = new Date(d.start_date);
      const endDate = new Date(d.end_date);
      const effectiveStartDate = startDate > tableConfig.startDateChart ? startDate : tableConfig.startDateChart;
      return Math.max(0, xScale(endDate) - xScale(effectiveStartDate));
    })
    .attr("height", tableConfig.barHeight)
    .on("mouseover", function(event, d) {
      let statusClass = `tooltip-${d.status.toLowerCase()}`;
      tooltip.html(`
        <strong>Produit:</strong> ${d.product}<br>
        <strong>Incident:</strong> ${d.status}<br>
        <strong>Début:</strong> ${d3.timeFormat("%d/%m/%Y")(d.start_date)}<br>
        <strong>Fin:</strong> ${d3.timeFormat("%d/%m/%Y")(d.end_date)}
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
      .attr("x", - tableConfig.margin.left + tableConfig.statusBarWidth + tableConfig.statusBarSpacing)
      .style("text-anchor", "start")
      .text(function(d) {
          return d.length > tableConfig.labelMaxLength ? d.substring(0, tableConfig.labelMaxLength) + "..." : d;
      })
      .on("mouseover", function(event, d) {
          const product = data.find(item => item.product === d);
          if (d.length > tableConfig.labelMaxLength || product) {
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
    .data(getProducts())
    .enter()
    .append("line")
      .attr("class", "grid-line")
      .attr("x1", -tableConfig.margin.left)
      .attr("x2", innerWidth)
      .attr("y1", d => yScale(d) + yScale.bandwidth())
      .attr("y2", d => yScale(d) + yScale.bandwidth())

  // Add vertical grid lines for months and years
  const monthTicks = xScale.ticks(d3.timeMonth.every(1));
  const yearTicks = xScale.ticks(d3.timeYear.every(1));

  // Add horizontal line on top of products
  innerChart.append("line")
    .attr("class", "year-line")
    .attr("x1", -tableConfig.margin.left)
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

  // Ajouter la ligne du dernier rapport
  innerChart.append("line")
    .attr("class", "current-date-line")
    .attr("x1", xScale(dateLastReport))
    .attr("x2", xScale(dateLastReport))
    .attr("y1", 0)
    .attr("y2", innerHeight);

  // Add status bars
  const groupedData = d3.group(data, d => getProductStatus(d).text);
  const statusColors = {
    "Rupture de stock": "var(--rupture)",
    "Tension d'approvisionnement": "var(--tension)",
    "Arrêt de commercialisation": "var(--gris)",
    "Disponible": "var(--disponible-bg)"
  };

  // Utilisé pour déterminer la longueur de la barre des produits disponibles
  const totalProductLength = getUniqueProductLength(data);
  let accumulatedHeight = 0;
  let productLeft = totalProductLength;

  groupedData.forEach((group, status) => {
    const productLength = getUniqueProductLength(group);
    let groupHeight;

    if (status === "Disponible") {
      groupHeight = productLeft * tableConfig.barHeight;
    } else {
      groupHeight = productLength * tableConfig.barHeight;
    }

    innerChart.append("rect")
      .attr("class", "status-bar")
      .attr("x", -tableConfig.margin.left)
      .attr("y", accumulatedHeight)
      .attr("width", tableConfig.statusBarWidth)
      .attr("height", groupHeight)
      .attr("fill", statusColors[status]);
    accumulatedHeight += groupHeight;
    productLeft -= productLength;
  });
}
