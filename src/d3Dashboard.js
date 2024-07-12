// Variables globales
let products, xScale, yScale, outerBox, innerChart, originalData;
const margin = { top: 50, right: 20, bottom: 30, left: 300 };
const width = 1000;
const barHeight = 15;
const currentDate = new Date();

let start_date_chart, end_date_chart;
let height, innerWidth, innerHeight;

d3.csv("/data/incidents.csv").then(data => {
  const parseTime = d3.timeParse("%Y-%m-%d");

  data.forEach(d => {
    d.start_date = parseTime(d.start_date);
    d.end_date = d.end_date ? parseTime(d.end_date) :  new Date(); // Use today's date if end_date is missing
  });

  start_date_chart = new Date(2022, 0, 1);
  end_date_chart = new Date(d3.max(data, d => d.end_date).getFullYear(), 11, 31);
  originalData = data;

  data.sort(customSort);
  updateVariables(data);
  drawBarChart(data, true);
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
      .attr("class", d => d.status === "Rupture" ? "Rupture" : "Tension");

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
  // Remove the ticks in front of the products
  innerChart
    .append("g")
      .call(d3.axisLeft(yScale).tickSize(0))
      .selectAll(".tick text")
      .attr("x", -margin.left)
      .style("text-anchor", "start");

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

  // Add vertical lines for each year beginning
  innerChart.selectAll(".year-line")
    .data(yearTicks)
    .enter()
    .append("line")
      .attr("class", "year-line")
      .attr("x1", d => xScale(d))
      .attr("x2", d => xScale(d))
      .attr("y1", 0)
      .attr("y2", innerHeight)

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

  // Add an additional vertical line at the end of the x-axis
  innerChart.append("line")
    .attr("class", "year-line")
    .attr("x1", innerWidth)
    .attr("x2", innerWidth)
    .attr("y1", 0)
    .attr("y2", innerHeight)

  d3.select("#search-box").on("input", function() {
    filterProducts(this.value, data);
  });

  // Add the vertical line
  innerChart.append("line")
    .attr("class", "current-date-line")
    .attr("x1", xScale(currentDate))
    .attr("x2", xScale(currentDate))
    .attr("y1", 0)
    .attr("y2", innerHeight);

  const formatTime = d3.utcFormat("%d/%m/%Y")
  // Add a label for the current date
  innerChart.append("text")
    .attr("class", "current-date-label")
    .attr("x", xScale(currentDate))
    .attr("y", innerHeight + 12)
    .attr("text-anchor", "middle")
    .text(formatTime(currentDate));
}

function customSort(a, b) {
  // If status is the same, sort by end_date (finished events at the bottom)
  return new Date(b.end_date) - new Date(a.end_date);
}

function filterProducts(searchTerm, data) {
  let filteredData;

  if (searchTerm.trim() === "") {
    // If search is empty, use all original data
    filteredData = originalData;
  } else {
    // Filter products based on search term
    filteredData = originalData.filter(d =>
      d.product.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Update variables and redraw chart
  updateVariables(filteredData);
  drawBarChart(filteredData, false);
}
