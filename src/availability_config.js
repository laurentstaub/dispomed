let dateLastReport, startDateChart, endDateChart;
let products = [];
let xScale, yScale;

export const tableConfig = {
  margin: { top: 40, right: 20, bottom: 30, left: 300 },
  width: 1000,
  barHeight: 14,
  setStartDateChart: (date) => startDateChart = date,
  getStartDateChart: () => startDateChart,
  setDateLastReport: (date) => dateLastReport = date,
  getDateLastReport: () => dateLastReport,
  setEndDateChart: (date) => endDateChart = date,
  getEndDateChart: () => endDateChart,
  labelMaxLength: 50,
  statusBarWidth: 20,
  statusBarSpacing: 5
};

export const getChartDimensions = (productsCount) => {
  const height = productsCount * tableConfig.barHeight + tableConfig.margin.top + tableConfig.margin.bottom;
  const innerWidth = tableConfig.width - tableConfig.margin.left - tableConfig.margin.right;
  const innerHeight = height - tableConfig.margin.top - tableConfig.margin.bottom;

  return { height, innerWidth, innerHeight };
};

export function setProducts(data) {
  products = Array.from(new Set(data.map(d => d.product)));
}

export function getProducts() {
  return products;
}

export function createScales(startDate, endDate, products, innerWidth, innerHeight) {
  xScale = d3.scaleTime()
    .domain([startDate, endDate])
    .range([0, innerWidth]);

  yScale = d3.scaleBand()
    .domain(products)
    .range([0, innerHeight])
    .padding(0.1);

  return { xScale, yScale };
}

export function getXScale() {
  return xScale;
}

export function getYScale() {
  return yScale;
}

export function processDataMonthlyChart(data) {
  // Generate an array of all months between start and end dates
  const allMonths = d3.timeMonth
    .range(tableConfig.getStartDateChart(), tableConfig.getEndDateChart())
    .map(d => new Date(d.getFullYear(), d.getMonth(), 1));

  const summaryMonthlyData = allMonths.map(monthDate => {
    let rupture = 0;
    let tension = 0;

    data.forEach(product => {
      // Check if the product's status is active on the 1st of the month
      if (product.start_date <= monthDate && product.end_date >= monthDate) {
        if (product.status === "Rupture") rupture++;
        else if (product.status === "Tension") tension++;
      }
    });

    return { date: d3.timeFormat("%Y-%m-%d")(monthDate), rupture, tension };
  });

  return summaryMonthlyData;
}
