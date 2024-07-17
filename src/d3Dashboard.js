// Variables globales du graphique
let products, xScale, yScale, outerBox, innerChart, originalData, periodFilteredData;
const margin = { top: 50, right: 20, bottom: 30, left: 300 };
const width = 1000;
const barHeight = 14;
const currentDate = new Date();
const labelMaxLength = 50;
const statusBarWidth = 20;
const statusBarSpacing = 5;
const totalStatusBar = statusBarWidth + statusBarSpacing;

let start_date_chart, end_date_chart, date_last_report;
let height, innerWidth, innerHeight;

// Mise à jour des variables globales générales du graphique
function updateVariables(data) {
  products = Array.from(new Set(data.map(d => d.product)));
  height = products.length * barHeight + margin.top + margin.bottom;
  innerWidth = width - margin.left - margin.right;
  innerHeight = height - margin.top - margin.bottom;

  xScale = d3.scaleTime()
    .domain([start_date_chart, end_date_chart])
    .range([0, innerWidth]);

  yScale = d3.scaleBand()
    .domain(products)
    .range([0, innerHeight])
    .padding(0.1);
}

function hasEventInChartPeriod(event) {
  return !(event.end_date <= start_date_chart);
}

function customSort(a, b) {
  const aIsActive = a.end_date >= date_last_report;
  const bIsActive = b.end_date >= date_last_report;

  // First, sort by active status
  if (aIsActive && !bIsActive) return -1;
  if (!aIsActive && bIsActive) return 1;

  // If both are active or both are inactive, sort by status
  if (aIsActive === bIsActive) {
    if (a.status === "Rupture" && b.status !== "Rupture") return -1;
    if (a.status !== "Rupture" && b.status === "Rupture") return 1;
    if (a.status === "Tension" && b.status !== "Tension") return -1;
    if (a.status !== "Tension" && b.status === "Tension") return 1;

    // If status is the same, sort by start_date (most recent first)
    return new Date(b.start_date) - new Date(a.start_date);
  }

  // If we reach here, one is active and one is inactive, but this is handled above
  return 0;
}

function filterProducts(searchTerm, data) {
  let filterData;

  if (searchTerm.trim() === "") {
    // If search is empty, use all original data
    filterData = periodFilteredData;
  } else {
    // Filter products based on search term
    filterData = periodFilteredData.filter(d =>
      d.product.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Update variables and redraw chart
  updateVariables(filterData);
  drawBarChart(filterData, false);
}

function groupProductsByStatus(data) {
  return d3.groups(data, d => getProductStatus(d).text);
}

function getProductStatus(d) {
    if (d.status === "arret") {
        return { text: "Arrêt de commercialisation", class: "tooltip-arret" };
    } else if (d.start_date <= date_last_report && d.end_date >= date_last_report) {
        if (d.status === "Rupture") {
            return { text: "Rupture de stock", class: "tooltip-rupture" };
        } else if (d.status === "Tension") {
            return { text: "Tension d'approvisionnement", class: "tooltip-tension" };
        } else if (d.status === "Arret") {
          return { text: "Arrêt de commercialisation", class: "tooltip-arret" };
        }
    } else if (!d.end_date || d.end_date < date_last_report) {
        return { text: "Disponible", class: "tooltip-disponible" };
    }
    return { text: "Statut inconnu", class: "" };
}

function getUniqueProductLength(eventList) {
  let result = [];

  eventList.forEach(event => {
    if (!result.includes(event.product)) result.push(event.product);
  })

  return result.length;
}

d3.csv("/data/incidents.csv").then(data => {
  const parseTime = d3.timeParse("%Y-%m-%d");

  data.forEach(d => {
    d.start_date = parseTime(d.start_date);
    d.mise_a_jour_date = parseTime(d.mise_a_jour_date);
    d.date_dernier_rapport = parseTime(d.date_dernier_rapport);

    if (!d.end_date) {
      // If end_date is missing, use the max of mise_a_jour_date and date_dernier_rapport
      d.end_date = new Date(Math.max(
        d.mise_a_jour_date ? d.mise_a_jour_date : 0,
        d.date_dernier_rapport ? d.date_dernier_rapport : 0
      ));
    } else {
      d.end_date = parseTime(d.end_date);
    }
  });

  start_date_chart = new Date(2023, 0, 1);
  end_date_chart = new Date(d3.max(data, d => d.end_date).getFullYear(), 11, 31);
  date_last_report = d3.max(data, d => d.end_date);
  //date_last_report.setHours(0, 0, 0, 0);

  originalData = data;
  periodFilteredData = originalData.filter(hasEventInChartPeriod);
  periodFilteredData.sort(customSort);

  updateVariables(periodFilteredData);
  drawBarChart(periodFilteredData, true);
});

function drawBarChart(data, isInitialSetup) {
  d3.select("#search-box").on("input", function() {
    filterProducts(this.value, data);
  });
  console.log(data);
  let outerBox, innerChart;

  // Création de la zone svg si elle n'existe pas
  if (isInitialSetup) {
    // Création initiale du SVG
    outerBox = d3.select("#dash")
      .append("svg")
        .attr("viewBox", `0, 0, ${width}, ${height}`)
        .attr("width", width)
        .attr("height", height);

    innerChart = outerBox
      .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Ajoutez ceci après la création du SVG et de innerChart
    const title = outerBox.append("text")
      .attr("class", "chart-title")
      .attr("x", 0)
      .attr("y", 10)
      .attr("text-anchor", "left")
      .style("font-size", "14px")
      .style("font-weight", "bold");
  // Sinon, réutilisation de la zone et nettoyage tous les éléments existants
  } else {
    // Mise à jour du SVG existant
    outerBox = d3.select("#dash svg")
      .attr("viewBox", `0, 0, ${width}, ${height}`)
      .attr("height", height);

    innerChart = d3.select("#dash svg g");
        // Remove all existing elements
        innerChart.selectAll("*").remove();
  }

  const formatDate = d3.timeFormat("%d/%m/%Y");
    outerBox.select(".chart-title")
      .text(`Date du dernier rapport : ${formatDate(date_last_report)}`);

  // Ajout du rectancle d'arrière plan du graphique
  innerChart.append("rect")
    .attr("class", "background")
    .attr("x", -margin.left)
    .attr("y", 0)
    .attr("width", innerWidth + margin.left)
    .attr("height", innerHeight);

  // Ajout des barres de chaque événement
  innerChart.selectAll("rect.bar")
       .data(data)
       .enter()
       .append("rect")
       .attr("class", d => `bar ${d.status}`)
       .attr("x", d => xScale(d.start_date > start_date_chart ? d.start_date : start_date_chart))
       .attr("y", d => yScale(d.product) + yScale.bandwidth() / 2 - barHeight / 2 - 1)
       .attr("width", d => {
         const startDate = new Date(d.start_date);
         const endDate = new Date(d.end_date);
         const effectiveStartDate = startDate > start_date_chart ? startDate : start_date_chart;
         return Math.max(0, xScale(endDate) - xScale(effectiveStartDate));
       })
       .attr("height", barHeight)
       .on("mouseover", function(event, d) {
         let statusClass = `tooltip-${d.status.toLowerCase()}`;
         tooltip.html(`
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
      .attr("x", -margin.left + totalStatusBar)
      .style("text-anchor", "start")
      .text(function(d) {
          return d.length > labelMaxLength ? d.substring(0, labelMaxLength) + "..." : d;
      })
      .on("mouseover", function(event, d) {
          const product = data.find(item => item.product === d);
          if (d.length > labelMaxLength || product) {
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
    .data(products)
    .enter()
    .append("line")
      .attr("class", "grid-line")
      .attr("x1", -margin.left)
      .attr("x2", innerWidth)
      .attr("y1", d => yScale(d) + yScale.bandwidth())
      .attr("y2", d => yScale(d) + yScale.bandwidth())

  // Add vertical grid lines for months and years
  const monthTicks = xScale.ticks(d3.timeMonth.every(1));
  const yearTicks = xScale.ticks(d3.timeYear.every(1));

  // Add horizontal line on top of products
  innerChart.append("line")
    .attr("class", "year-line")
    .attr("x1", -margin.left)
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

  // // Add vertical lines for each year beginning
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

  // Add the vertical line
  innerChart.append("line")
    .attr("class", "current-date-line")
    .attr("x1", xScale(date_last_report))
    .attr("x2", xScale(date_last_report))
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
      groupHeight = productLeft * barHeight;
    } else {
      groupHeight = productLength * barHeight;
    }

    innerChart.append("rect")
      .attr("class", "status-bar")
      .attr("x", -margin.left)
      .attr("y", accumulatedHeight)
      .attr("width", statusBarWidth)
      .attr("height", groupHeight)
      .attr("fill", statusColors[status]);
    accumulatedHeight += groupHeight;
    productLeft -= productLength;
  });

    // Adjust the position of other elements
   // innerChart.attr("transform", `translate(${margin.left}, ${margin.top})`);
}
