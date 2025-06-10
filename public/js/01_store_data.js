class ConfigManager {
  static instance = null;

  static getInstance() {
    if (!ConfigManager.instance) {
      config.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  constructor() {
    if (ConfigManager.instance) {
      return ConfigManager.instance;
    }
    ConfigManager.instance = this;
    this.initializeConfig();
  }

  initializeConfig() {
    this.dateReport = null;
    this.startDate = null;
    this.endDate = null;
    this.products = [];
    this.accentedProducts = [];
    this.ATCClasses = [];
    this.molecule = "";
    this.searchTerm = "";
    this.monthsToShow = 12;
    this.atcCode = "";
    this.xScale = null;
    this.yScale = null;
    this.moleculeClassMap = [];
    this.vaccinesOnly = false;
    this.displayState = 'initial'; // 'initial', 'filtered', or 'no_results'
  }

  setStartDate(date) { this.startDate = date; }
  getStartDate() { return this.startDate; }

  setDateReport(date) { this.dateReport = date; }
  getDateReport() { return this.dateReport; }

  setEndDate(date) { this.endDate = date; }
  getEndDate() { return this.endDate; }

  setProducts(data) {
    this.products = Array.from(new Set(data.map((d) => d.product)));
  }
  getProducts() { return this.products; }

  setAccentedProducts(data) {
    this.accentedProducts = Array.from(new Set(data.map((d) => d.accented_product)));
  }
  getAccentedProducts() { return this.accentedProducts; }

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

  setMoleculeClassMap(filteredList) { this.moleculeClassMap = filteredList; }
  getMoleculeClassMap() { return this.moleculeClassMap; }

  setSearchTerm(word) { this.searchTerm = word; }
  getSearchTerm() { return this.searchTerm; }

  setMonthsToShow(period) { this.monthsToShow = period; }
  getMonthsToShow() { return this.monthsToShow; }

  setATCClass(atcCodeLetter) { this.atcCode = atcCodeLetter; }
  getATCClass() { return this.atcCode; }

  setVaccinesOnly(value) { this.vaccinesOnly = value; }
  getVaccinesOnly() { return this.vaccinesOnly; }

  setDisplayState(state) { 
    this.displayState = state; 
  }
  getDisplayState() { 
    return this.displayState; 
  }

  processDataMonthlyChart(data) {
    const allMonths = d3.timeMonth
      .range(this.startDate, this.endDate)
      .map((d) => new Date(d.getFullYear(), d.getMonth(), 1));

    // Utility to count spécialités
    const getSpecialiteCount = function(product) {
      if (Array.isArray(product.cis_codes) && product.cis_codes.length > 0) {
        return product.cis_codes.length;
      }
      return 1;
    };

    return allMonths.map((monthDate) => {
      let rupture = 0;
      let tension = 0;

      data.forEach((product) => {
        if (
          product.start_date <= monthDate &&
          product.calculated_end_date >= monthDate
        ) {
          const count = getSpecialiteCount(product);
          if (product.status === "Rupture") rupture += count;
          else if (product.status === "Tension") tension += count;
        }
      });

      return { date: d3.timeFormat("%Y-%m-%d")(monthDate), rupture, tension };
    });
  }
}

const dataManager = new ConfigManager();
Object.preventExtensions(dataManager);

export { dataManager };
