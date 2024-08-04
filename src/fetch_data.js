import {
  config,
  setProducts,
} from './draw_config.js';

import {
  processDates,
} from '../library/utils.js';

export async function fetchATCClasses() {
  const baseUrl = 'http://localhost:3000'; // Or server's base URL
  const url = `${baseUrl}/api/incidents/ATCClasses`;

  return fetch(url)
    .then(response => response.json())
    .then(data => {
      console.log(data);
      let classesArray = data.map(classe => classe.classe_atc);
      return classesArray.map(ATCClass => {
        return { code: ATCClass.slice(0, 1), name: ATCClass.slice(4) }
      });
    })
    .catch(error => {
      console.error('Error:', error);
      throw error;
    });
}

export async function fetchTableChartData(searchTerm = '', monthsToShow = 12) {
  const baseUrl = 'http://localhost:3000'; // Or server's base URL
  const queryString = searchTerm ? new URLSearchParams({ product: searchTerm }).toString() : '';
  const url = `${baseUrl}/api/incidents${queryString ? '?' + queryString : ''}`;

  return fetch(url)
    .then(response => response.json())
    .then(data => {
      const processedData = processDates(data);
      const lastReportDate = Math.max(...processedData.map(d => new Date(d.calculated_end_date)));
      const [startDate, endDate] = getDateRange(lastReportDate, monthsToShow);
      config.report.setDateLastReport(lastReportDate);
      config.report.setStartDateChart(startDate);
      config.report.setEndDateChart(endDate);

      setProducts(processedData);
      return processedData;
    })
    .catch(error => {
      console.error('Error:', error);
      throw error;
    });
}

function getDateRange(lastReportDate, monthsToShow) {
  const endDate = new Date(lastReportDate);
  endDate.setDate(1); // Set to first day of the month
  endDate.setMonth(endDate.getMonth() + 1); // Move to the start of the next month

  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - monthsToShow);

  return [startDate, endDate];
}
