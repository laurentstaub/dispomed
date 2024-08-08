import {
  config,
  setProducts,
} from './draw_config.js';

import {
  processDates,
} from '../library/utils.js';

// First query to run
export async function fetchATCClasses(monthsToShow = 12) {
  const baseUrl = 'http://localhost:3000'; // Or server's base URL
  const queryString = new URLSearchParams({ monthsToShow: monthsToShow }).toString();
  const url = `${baseUrl}/api/incidents/ATCClasses${queryString ? '?' + queryString : ''}`;

  return fetch(url)
    .then(response => response.json())
    .then(data => {
      const atcClasses = new Map();
      const allMolecules = new Set();
      const atcMoleculeMap = new Map();

      data.forEach(row => {
        // get the unique ATC classes
        atcClasses.set(row.atc_code, row.atc_description);

        if (row.molecule_id && row.molecule_name) {
          const molecule = { id: row.molecule_id, name: row.molecule_name };
          allMolecules.add(molecule);

          if (!atcMoleculeMap.has(row.atc_code)) {
            atcMoleculeMap.set(row.atc_code, new Set());
          }
          atcMoleculeMap.get(row.atc_code).add(molecule);
        }
      });

      const atcClassesList = Array.from(atcClasses, ([code, description]) => ({ code, description }));
      const allMoleculesList = Array.from(allMolecules).sort((a, b) => a.name.localeCompare(b.name));

      for (let [atcCode, molecules] of atcMoleculeMap) {
        atcMoleculeMap.set(atcCode, Array.from(molecules));
      }

      return {
        atcClassesList,
        allMoleculesList,
        atcMoleculeMap
      };
    })

      // console.log(data);
      // let classesArray = data.map(classe => classe.classe_atc);
      // return classesArray.map(ATCClass => {
      //   return { code: ATCClass.slice(0, 1), name: ATCClass.slice(4) }
      // })

    .catch(error => {
      console.error('Error:', error);
      throw error;
    });
}

export async function fetchTableChartData(searchTerm = '', monthsToShow = 12, atcClass = '') {
  const baseUrl = 'http://localhost:3000'; // Or server's base URL
  const queryString = new URLSearchParams({ product: searchTerm, monthsToShow: monthsToShow, atcClass: atcClass }).toString();
  const url = `${baseUrl}/api/incidents${queryString ? '?' + queryString : ''}`;

  return fetch(url)
    .then(response => response.json())
    .then(data => {
      console.log(data);
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
