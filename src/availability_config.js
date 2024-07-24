let dateLastReport, endDateChart;
let products = [];
let xScale, yScale;

export const tableConfig = {
  margin: { top: 50, right: 20, bottom: 30, left: 300 },
  width: 1000,
  barHeight: 14,
  startDateChart: new Date(2023, 0, 1),
  // LastReportDate is dependant upon the dataset
  setDateLastReport: (date) => dateLastReport = date,
  getDateLastReport: () => dateLastReport,
  setEndDateChart: (date) => endDateChart = date,
  getEndDateChart: () => endDateChart,
  labelMaxLength: 50,
  statusBarWidth: 20,
  statusBarSpacing: 5,
  colors: {
    rupture: "var(--rupture)",
    tension: "var(--tension)",
    arret: "var(--gris)",
    disponible: "var(--disponible-bg)"
  }
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
