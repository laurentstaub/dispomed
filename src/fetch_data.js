import { configManager } from './draw_config.js';
import { processDates } from '../library/utils.js';

export async function fetchTableChartData(isInitialSetup, monthsToShow = 12, searchTerm = '', atcClass = '', molecule = '') {
  const baseUrl = 'http://localhost:3000';
  const queryString = new URLSearchParams({
    monthsToShow: monthsToShow,
    product: searchTerm,
    atcClass: atcClass,
    molecule: molecule
  }).toString();
  const url = `${baseUrl}/api/incidents${queryString ? '?' + queryString : ''}`;

  return fetch(url)
    .then(response => response.json())
    .then(data => {
      console.log(`Data form the central fetch function:`, data);
      const processedData = processDates(data);
      const lastReportDate = Math.max(...processedData.map(d => new Date(d.calculated_end_date)));
      const [startDate, endDate] = getDateRange(lastReportDate, monthsToShow);
      configManager.setDateLastReport(lastReportDate);
      configManager.setStartDateChart(startDate);
      configManager.setEndDateChart(endDate);
      configManager.setProducts(processedData);

      // We want to set a full map of atc/molecules from the initial base
      // to populate the list of classes and molecules whatever the selections are
      // We trigger an initial setup every time we change the period
      if (isInitialSetup) {
        const atcMoleculeFullMap = data.map(d => {
          return {
            molecule: `${d.molecule_id} - ${d.molecule}`,
            atcClass: d.atc_code,
          }
        });

        // To get the unique atcClass/molecules couples
        let mappedAtcMolecules = [...new Map(atcMoleculeFullMap.map((line) => {
          return [
            line['molecule'], line['atcClass']
          ];
        }))];

        let arrayAtcMolecules = mappedAtcMolecules.map(line => {
          return {
            atcClass: line[1],
            moleculeName: line[0].split(" - ")[1],
            moleculeId: line[0].split(" - ")[0],
          }
        });
        console.log(arrayAtcMolecules);

        configManager.setMoleculeClassMap(arrayAtcMolecules);
      }

      return processedData;
    })
}

function getDateRange(lastReportDate, monthsToShow) {
  const endDate = new Date(lastReportDate);
  endDate.setDate(1); // Set to first day of the month
  endDate.setMonth(endDate.getMonth() + 1); // Move to the start of the next month

  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - monthsToShow);

  return [startDate, endDate];
}
