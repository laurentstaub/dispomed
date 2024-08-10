import { configManager } from './draw_config.js';
import { processDates } from '../library/utils.js';

export async function fetchTableChartData(monthsToShow = 12, searchTerm = '', atcClass = '', molecule = '') {
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
