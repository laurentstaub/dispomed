// Configuration object
export const config = {
  report: {
    dateLastReport: null,
    startDateChart: null,
    endDateChart: null,
    setStartDateChart: (date) => config.report.startDateChart = date,
    getStartDateChart: () => config.report.startDateChart,
    setDateLastReport: (date) => config.report.dateLastReport = date,
    getDateLastReport: () => config.report.dateLastReport,
    setEndDateChart: (date) => config.report.endDateChart = date,
    getEndDateChart: () => config.report.endDateChart,
  },
  summaryChart: {
    margin: { top: 50, right: 0, bottom: 0, left: 20 },
    width: 700,
    height: 250,
  },
  table: {
    margin: { top: 40, right: 20, bottom: 30, left: 300 },
    width: 1000,
    barHeight: 14,
    labelMaxLength: 50,
    statusBarWidth: 20,
    statusBarSpacing: 5
  }
};

// Products-related functions
let products = [];

export function setProducts(data) {
  products = Array.from(new Set(data.map(d => d.product)));
}

export function getProducts() {
  return products;
}

// Setting and getting ATC classes
let ATCClasses = [];

export function setATCClasses(data) {
  ATCClasses = Array.from(new Set(data.map(d => d.classe_atc))).sort();
  ATCClasses = ATCClasses.map((ATCClass) => {
    return { code: ATCClass.slice(0, 1), name: ATCClass.slice(4) };
  })
}

export function getATCClasses() {
  return ATCClasses;
}

// Setting and getting searchTerm
let searchTerm = '';

export function setSearchTerm(word) {
  searchTerm = word;
}

export function getSearchTerm() {
  return searchTerm;
}

let monthsToShow = 12;

export function setMonthsToShow(period) {
  monthsToShow = period;
}

export function getMonthsToShow() {
  return monthsToShow;
}

// Chart-related functions
let xScale, yScale;

export function getTableDimensions(productsCount) {
  const height = productsCount * config.table.barHeight + config.table.margin.top + config.table.margin.bottom;
  const innerWidth = config.table.width - config.table.margin.left - config.table.margin.right;
  const innerHeight = height - config.table.margin.top - config.table.margin.bottom;

  return { height, innerWidth, innerHeight };
}

export function getSummaryChartDimensions() {
  const margin = config.summaryChart.margin;
  const innerWidth = config.summaryChart.width - margin.left - margin.right;
  const innerHeight = config.summaryChart.height - margin.top - margin.bottom;

  return { innerWidth, innerHeight }
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
  const allMonths = d3.timeMonth
    .range(config.report.startDateChart, config.report.endDateChart)
    .map(d => new Date(d.getFullYear(), d.getMonth(), 1));

  return allMonths.map(monthDate => {
    let rupture = 0;
    let tension = 0;

    data.forEach(product => {
      if (product.start_date <= monthDate && product.calculated_end_date >= monthDate) {
        if (product.status === "Rupture") rupture++;
        else if (product.status === "Tension") tension++;
      }
    });

    return { date: d3.timeFormat("%Y-%m-%d")(monthDate), rupture, tension };
  });
}
