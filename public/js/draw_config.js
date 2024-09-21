class ConfigManager {
  static instance = null;

  static getInstance() {
    if (!ConfigManager.instance) {
      config.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  constructor() {
    if (ConfigManager.instance) { return ConfigManager.instance; }
    ConfigManager.instance = this;
    this.initializeConfig();
  }

  initializeConfig() {
    this.dateLastReport = null;
    this.startDateChart = null;
    this.endDateChart = null;
    this.products = [];
    this.ATCClasses = [];
    this.molecule = "";
    this.searchTerm = "";
    this.monthsToShow = 12;
    this.atcCode = "";
    this.xScale = null;
    this.yScale = null;
    this.moleculeClassMap = [];
  }

  setStartDateChart(date) { this.startDateChart = date; }
  getStartDateChart() { return this.startDateChart; }

  setDateLastReport(date) { this.dateLastReport = date; }
  getDateLastReport() { return this.dateLastReport; }

  setEndDateChart(date) { this.endDateChart = date; }
  getEndDateChart() { return this.endDateChart; }

  setProducts(data) {
    this.products = Array.from(new Set(data.map((d) => d.product)));
  }
  getProducts() { return this.products; }

  setATCClasses(data) {
    this.ATCClasses = Array.from(new Set(data.map((d) => d.classe_atc)))
      .sort()
      .map((ATCClass) => ({
        code: ATCClass.slice(0, 1),
        name: ATCClass.slice(4),
      }));
  }
  getATCClasses() { return this.ATCClasses; }

  setMolecule(data) { this.molecule = data; }
  getMolecule() { return this.molecule; }

  setMoleculeClassMap(filteredList) {
    this.moleculeClassMap = filteredList;
  }
  getMoleculeClassMap() { return this.moleculeClassMap; }

  setSearchTerm(word) { this.searchTerm = word; }
  getSearchTerm() { return this.searchTerm; }

  setMonthsToShow(period) { this.monthsToShow = period; }
  getMonthsToShow() { return this.monthsToShow; }

  setATCClass(atcCodeLetter) { this.atcCode = atcCodeLetter; }
  getATCClass() { return this.atcCode; }

  processDataMonthlyChart(data) {
    const allMonths = d3.timeMonth
      .range(this.startDateChart, this.endDateChart)
      .map((d) => new Date(d.getFullYear(), d.getMonth(), 1));

    return allMonths.map((monthDate) => {
      let rupture = 0;
      let tension = 0;

      data.forEach((product) => {
        if (
          product.start_date <= monthDate &&
          product.calculated_end_date >= monthDate
        ) {
          if (product.status === "Rupture") rupture++;
          else if (product.status === "Tension") tension++;
        }
      });

      return { date: d3.timeFormat("%Y-%m-%d")(monthDate), rupture, tension };
    });
  }
}

const config = new ConfigManager();
Object.preventExtensions(config);

export { config };
