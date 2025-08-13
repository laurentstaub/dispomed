import { dataManager } from "./01_store_data.js";
let API_BASE_URL = "http://localhost:3000";

// Parses dates from the sql query
function processDates(data) {
  const parseTime = createTimeParse("%Y-%m-%d");

  return data.map((d) => ({
    ...d,
    start_date: parseTime(d.start_date),
    end_date: parseTime(d.end_date),
    mise_a_jour_date: parseTime(d.mise_a_jour_date),
    date_dernier_rapport: parseTime(d.date_dernier_rapport),
    calculated_end_date: parseTime(d.calculated_end_date),
  }));
}

// Used to process dates in the processDates function
function createTimeParse(format) {
  // This function only handles "%Y-%m-%d" format
  if (format !== "%Y-%m-%d") {
    throw new Error("Only %Y-%m-%d format is supported");
  }

  return function parseTime(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;

    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (isNaN(date.getTime())) return null;

    return date;
  };
}

async function fetchConfig() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    API_BASE_URL = config.API_BASE_URL;
  } catch (error) {
    console.error("Failed to fetch config:", error);
  }
}

export async function fetchTableChartData(
    monthsToShow = 12,
    searchTerm = "",
    atcClass = "",
    molecule = "",
) {
    await fetchConfig();
    const queryString = new URLSearchParams({
        monthsToShow: monthsToShow,
        product: searchTerm,
        atcClass: atcClass,
        ...(molecule ? { molecule: molecule } : {}),
        ...(dataManager.getVaccinesOnly() ? { vaccinesOnly: 'true' } : {})
    }).toString();

    const url = `${API_BASE_URL}/api/incidents${queryString ? "?" + queryString : ""}`;

    return fetch(url)
        .then((response) => response.json())
        .then((data) => {
            const processedData = processDates(data);
            const lastReportDate = Math.max(
                dataManager.getDateReport(),
                Math.max(...processedData.map((d) => new Date(d.calculated_end_date))),
            );
            const [startDate, endDate] = getDateRange(lastReportDate, monthsToShow);
            dataManager.setDateReport(lastReportDate);
            dataManager.setStartDate(startDate);
            dataManager.setEndDate(endDate);
            dataManager.setProducts(processedData);
            dataManager.setAccentedProducts(processedData);

            // Check if molecule class map is empty to determine if this is initial setup
            const isInitialSetup = dataManager.getMoleculeClassMap().length === 0;

            if (isInitialSetup) {
                const atcMoleculeFullMap = data.map((d) => {
                    return {
                        molecule: `${d.molecule_id} - ${d.molecule}`,
                        atcClass: d.atc_code,
                    };
                });

                // To get the unique atcClass/molecules couples
                let mappedAtcMolecules = [
                    ...new Map(
                        atcMoleculeFullMap.map((line) => {
                            return [line["molecule"], line["atcClass"]];
                        }),
                    ),
                ];

                let arrayAtcMolecules = mappedAtcMolecules.map((line) => {
                    return {
                        atcClass: line[1],
                        moleculeName: line[0].split(" - ")[1],
                        moleculeId: line[0].split(" - ")[0],
                    };
                });

                let sortedAtcMolecules = arrayAtcMolecules.sort((a, b) => {
                    return a.moleculeName.localeCompare(b.moleculeName);
                });

                dataManager.setMoleculeClassMap(sortedAtcMolecules);
            }

            return processedData;
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

export async function fetchSubstitutions(code_cis) {
  await fetchConfig();
  const url = `${API_BASE_URL}/api/substitutions/${code_cis}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch substitutions for CIS ${code_cis}:`, error);
    return []; // Return empty array on error
  }
}

export async function fetchSearchSuggestions(searchTerm, monthsToShow = 12) {
  await fetchConfig();
  const queryString = new URLSearchParams({
    searchTerm: searchTerm,
    monthsToShow: monthsToShow
  }).toString();
  
  const url = `${API_BASE_URL}/api/search?${queryString}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch search suggestions:`, error);
    return [];
  }
}
