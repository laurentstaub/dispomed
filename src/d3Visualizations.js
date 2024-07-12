
d3.json("/data/latest-data.json")
  .then((data) => {
    const statutCounts = d3.rollup(data, (v) => v.length, (d) => d.Statut);
    const statutCountsArray = Array.from(statutCounts, ([key, value]) => ({
      Statut: key,
      Count: value,
  }));

  console.log(statutCountsArray);
  drawBarChart(statutCountsArray);
});

const drawBarChart = (data) => {
  const margin = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = 1000;
  const height = 500;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = d3.scaleBand()
    .domain(data.map((d) => d.Statut))
    .range([0, innerWidth]);

  const yScale = d3.scaleLinear()
    .range([innerHeight, 0])
    .domain([0, d3.max(data, (d) => d.Count)]);

  // Append the svg object to the chart div of the page
  const outerBox = d3.select("#chart")
    .append("svg")
      .attr("viewBox", `0, 0, ${width}, ${height}`)

  const innerChart = outerBox
    .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Append the rectangles for the bar chart
  innerChart
    .selectAll(".bar")
    .data(data)
    .join("rect")
      .attr("class", "bar")
      .attr("x", (d) => xScale(d.Statut))
      .attr("width", xScale.bandwidth())
      .attr("y", (d) => yScale(d.Count))
      .attr("height", (d) => height - yScale(d.Count));

  // Add the x Axis
  innerChart
    .append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(xScale));

  // Add the y Axis
  innerChart
    .append("g")
      .call(d3.axisLeft(yScale));
};
