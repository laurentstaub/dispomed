let instance = null;

class ConfigManager {
  constructor() {
    if (instance) {
      return instance;
    }

    this.config = {
      report: {
        dateLastReport: null,
        startDateChart: null,
        endDateChart: null,
      },
      summaryChart: {
        margin: { top: 20, right: 0, bottom: 0, left: 52 },
        width: 630,
        height: 280,
      },
      table: {
        margin: { top: 0, right: 0, bottom: 0, left: 352 },
        width: 900,
        barHeight: 18,
        labelMaxLength: 50,
        statusBarWidth: 2,
        statusBarSpacing: 5
      }
    };

    this.products = [];
    this.ATCClasses = [];
    this.molecule = '';
    this.searchTerm = '';
    this.monthsToShow = 12;
    this.atcCode = '';
    this.xScale = null;
    this.yScale = null;
    this.moleculeClassMap = [];

    instance = this;
  }

  setStartDateChart(date) { this.config.report.startDateChart = date; }
  getStartDateChart() { return this.config.report.startDateChart; }
  setDateLastReport(date) { this.config.report.dateLastReport = date; }
  getDateLastReport() { return this.config.report.dateLastReport; }
  setEndDateChart(date) { this.config.report.endDateChart = date; }
  getEndDateChart() { return this.config.report.endDateChart; }

  setProducts(data) {
    this.products = Array.from(new Set(data.map(d => d.product)));
  }
  getProducts() { return this.products; }

  setATCClasses(data) {
    this.ATCClasses = Array.from(new Set(data.map(d => d.classe_atc))).sort()
      .map(ATCClass => ({ code: ATCClass.slice(0, 1), name: ATCClass.slice(4) }));
  }
  getATCClasses() { return this.ATCClasses; }

  setMolecule(data) { this.molecule = data; }
  getMolecule() { return this.molecule; }

  setMoleculeClassMap(filteredList) { this.moleculeClassMap = filteredList; }
  getMoleculeClassMap() { return this.moleculeClassMap; }

  setSearchTerm(word) { this.searchTerm = word; }
  getSearchTerm() { return this.searchTerm; }

  setMonthsToShow(period) { this.monthsToShow = period; }
  getMonthsToShow() { return this.monthsToShow; }

  setATCClass(atcCodeLetter) { this.atcCode = atcCodeLetter; }
  getATCClass() { return this.atcCode; }

  // Chart-related methods
  getTableDimensions(productsCount) {
    const { table } = this.config;
    const height = productsCount * table.barHeight + table.margin.top + table.margin.bottom;
    const innerWidth = table.width - table.margin.left - table.margin.right;
    const innerHeight = height - table.margin.top - table.margin.bottom;
    return { height, innerWidth, innerHeight };
  }

  getSummaryChartDimensions() {
    const { summaryChart } = this.config;
    const innerWidth = summaryChart.width - summaryChart.margin.left - summaryChart.margin.right;
    const innerHeight = summaryChart.height - summaryChart.margin.top - summaryChart.margin.bottom - 20;
    return { innerWidth, innerHeight };
  }

  createScales(startDate, endDate, products, innerWidth, innerHeight) {
    this.xScale = d3.scaleTime()
      .domain([startDate, endDate])
      .range([0, innerWidth]);

    this.yScale = d3.scaleBand()
      .domain(products)
      .range([0, innerHeight])
      .padding(0.1);

    return { xScale: this.xScale, yScale: this.yScale };
  }

  getXScale() { return this.xScale; }
  getYScale() { return this.yScale; }

  processDataMonthlyChart(data) {
    const allMonths = d3.timeMonth
      .range(this.config.report.startDateChart, this.config.report.endDateChart)
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
}

const configManager = new ConfigManager();
Object.preventExtensions(configManager);

export { configManager };
