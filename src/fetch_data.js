import * as d3 from 'd3';
import {
  config,
} from './availability_config.js';

import {
  customSort,
  processDates,
} from '../library/utils.js';


export async function fetchAndProcessData(searchTerm = '', monthsToShow = 12) {
  const baseUrl = 'http://localhost:3000'; // Or your server's base URL
  const queryString = searchTerm ? new URLSearchParams({ product: searchTerm }).toString() : '';
  const url = `${baseUrl}/api/incidents${queryString ? '?' + queryString : ''}`;

  return fetch(url)
    .then(response => response.json())
    .then(data => {
      const processedData = processDates(data);

      const lastReportDate = d3.max(processedData, d => d.end_date);
      const [startDate, endDate] = getDateRange(lastReportDate, monthsToShow);
      config.report.setDateLastReport(lastReportDate);
      config.report.setStartDateChart(startDate);
      config.report.setEndDateChart(endDate);

      const periodFilteredData = processedData
        .filter(d => d.end_date >= config.report.getStartDateChart())
        .sort(customSort);

      return periodFilteredData;
    })
    .catch(error => {
      console.error('Error:', error);
      throw error;
    });
}

function updateDateRange(months) {
  const [startDate, endDate] = getDateRange(config.report.getDateLastReport(), months);
  config.report.setStartDateChart(startDate);
  config.report.setEndDateChart(endDate);
  fetchAndProcessData('', months);
}

function getDateRange(lastReportDate, monthsToShow) {
  const endDate = d3.timeMonth.ceil(lastReportDate);
  const startDate = d3.timeMonth.offset(endDate, -monthsToShow);
  return [startDate, endDate];
}

function updateLastReportDate() {
  const formatDate = d3.timeFormat("%d/%m/%Y");
  d3.select("#last-report-date")
    .text(`Date du dernier rapport : ${formatDate(config.report.getDateLastReport())}`);
}
