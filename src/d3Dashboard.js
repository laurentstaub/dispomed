// Variables globales
let products, xScale, yScale, outerBox, innerChart, originalData, filteredData;
const margin = { top: 50, right: 20, bottom: 30, left: 300 };
const width = 1000;
const barHeight = 15;
const currentDate = new Date();
const labelMaxLength = 50;

let start_date_chart, end_date_chart, date_last_report;
let height, innerWidth, innerHeight;

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
  filteredData = originalData.filter(hasEventInChartPeriod);
  filteredData.sort(customSort);

  updateVariables(filteredData);
  drawBarChart(filteredData, true);
});

function updateVariables(data) {
  products = Array.from(new Set(data.map(d => d.product)));

  // Définir height, innerWidth et innerHeight une seule fois
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

function drawBarChart(data, isInitialSetup) {
  console.log(data);

  let outerBox, innerChart;

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

  } else {
    // Mise à jour du SVG existant
    outerBox = d3.select("#dash svg")
      .attr("viewBox", `0, 0, ${width}, ${height}`)
      .attr("height", height);

    innerChart = d3.select("#dash svg g");
        // Remove all existing elements
        innerChart.selectAll("*").remove();
  }

  // Add background rectangle for bars
  innerChart.append("rect")
    .attr("class", "background")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", innerWidth)
    .attr("height", innerHeight);

// BARS
  // Add bars with color based on status
  innerChart.selectAll("rect.bar")
    .data(data)
    .enter()
    .append("rect")
      .attr("class", d => `bar ${d.status}`)
      .attr("x", d => {
        return xScale(d.start_date > start_date_chart ? d.start_date : start_date_chart);
      })
      .attr("y", d => yScale(d.product) + yScale.bandwidth() / 2 - barHeight / 2 - 1)
      .attr("width", d => {
        const startDate = new Date(d.start_date);
        const endDate = new Date(d.end_date);
        const effectiveStartDate = startDate > start_date_chart ? startDate : start_date_chart;
        return Math.max(0, xScale(endDate) - xScale(effectiveStartDate));
      })
      .attr("height", barHeight)
      .attr("class", d => d.status);

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
      .attr("transform", `translate(0,0)`) // Adjust position to place it below the year axis
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

// Y-AXIS
  // innerChart
  //   .append("g")
  //   .call(d3.axisLeft(yScale).tickSize(0))
  //   .selectAll(".tick text")
  //   .attr("x", -margin.left)
  //   .style("text-anchor", "start")
  //   .text(function(d) {
  //     return d.length > labelMaxLength ? d.substring(0, labelMaxLength) + "..." : d;
  //   })
  //   .on("mouseover", function(event, d) {
  //     const product = data.find(item => item.product === d);
  //     if (d.length > labelMaxLength || product) {
  //       const tooltip = d3.select("#tooltip");
  //       tooltip.transition().duration(200).style("opacity", 0.9);
  //       tooltip.html(`
  //         <strong>Produit:</strong> ${d}<br>
  //         <strong>Statut:</strong> ${getProductStatus(product)}
  //       `)
  //         .style("left", (event.pageX + 10) + "px")
  //         .style("top", (event.pageY - 28) + "px");
  //     }
  //   })
  //   .on("mouseout", function() {
  //     d3.select("#tooltip").transition().duration(500).style("opacity", 0);
  //   });

  innerChart
      .append("g")
      .call(d3.axisLeft(yScale).tickSize(0))
      .selectAll(".tick text")
      .attr("x", -margin.left)
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

  // Add horizontal line on top of products
  innerChart.append("line")
    .attr("class", "year-line")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", -margin.top + 10)
    .attr("y2", -margin.top + 10)

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
  // innerChart.selectAll(".year-line")
  //   .data(yearTicks)
  //   .enter()
  //   .append("line")
  //     .attr("class", "year-line")
  //     .attr("x1", d => xScale(d))
  //     .attr("x2", d => xScale(d))
  //     .attr("y1", 0)
  //     .attr("y2", innerHeight)

  // // Add an additional vertical line at the end of the x-axis
  // innerChart.append("line")
  //   .attr("class", "end-line")
  //   .attr("x1", innerWidth)
  //   .attr("x2", innerWidth)
  //   .attr("y1", 0)
  //   .attr("y2", innerHeight)

  d3.select("#search-box").on("input", function() {
    filterProducts(this.value, filteredData);
  });

  // Add the vertical line
  innerChart.append("line")
    .attr("class", "current-date-line")
    .attr("x1", xScale(date_last_report))
    .attr("x2", xScale(date_last_report))
    .attr("y1", 0)
    .attr("y2", innerHeight);

  const formatTime = d3.utcFormat("%d/%m/%Y")
  // Add a label for the current date
  innerChart.append("text")
    .attr("class", "current-date-label")
    .attr("x", xScale(date_last_report))
    .attr("y", innerHeight + 12)
    .attr("text-anchor", "middle")
    .text(formatTime(date_last_report));
}

function hasEventInChartPeriod(product) {
  return (
    (product.start_date <= end_date_chart && product.start_date >= start_date_chart) ||
    (product.end_date <= end_date_chart && product.end_date >= start_date_chart) ||
    (product.start_date <= start_date_chart && product.end_date >= end_date_chart)
  );
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
    filterData = filteredData;
  } else {
    // Filter products based on search term
    filterData = filteredData.filter(d =>
      d.product.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Update variables and redraw chart
  updateVariables(filterData);
  drawBarChart(filterData, false);
}

// function getProductStatus(d) {
//   if (d.status === "arret") {
//     return "Arrêt de commercialisation";
//   } else if (d.start_date <= date_last_report && d.end_date >= date_last_report) {
//     if (d.status === "Rupture") {
//       return "Rupture de stock";
//     } else if (d.status === "Tension") {
//       return "Tension d'approvisionnement";
//     } else if (d.status === "Arret") {
//       return "Arrêt de commercialisation";
//     }
//   } else if (!d.end_date || d.end_date < date_last_report) {
//     return "Disponible";
//   }
//   return "Statut inconnu";
// }
//
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
