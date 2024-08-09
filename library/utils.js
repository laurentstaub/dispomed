import { configManager } from '../src/draw_config.js';

export function getProductStatus(d) {
  const dateLastReport = configManager.getDateLastReport();

  if (d.status === "arret") {
    return { text: "Arrêt de commercialisation", class: "tooltip-arret" };
  } else if (d.start_date <= dateLastReport && d.calculated_end_date >= dateLastReport) {
    if (d.status === "Rupture") {
      return { text: "Rupture de stock", class: "tooltip-rupture" };
    } else if (d.status === "Tension") {
      return { text: "Tension d'approvisionnement", class: "tooltip-tension" };
    } else if (d.status === "Arret") {
      return { text: "Arrêt de commercialisation", class: "tooltip-arret" };
    }
  } else if (!d.calculated_end_date || d.calculated_end_date < dateLastReport) {
      return { text: "Disponible", class: "tooltip-disponible" };
  }
  return { text: "Statut inconnu", class: "" };
}

// Used to get the unique product list from the SQL query
export function getUniqueProductLength(eventList) {
  let result = [];

  eventList.forEach(event => {
    if (!result.includes(event.product)) result.push(event.product);
  })

  return result.length;
}

// Used to process dates in the processDates function
function createTimeParse(format) {
  // This function only handles "%Y-%m-%d" format
  if (format !== "%Y-%m-%d") {
    throw new Error("Only %Y-%m-%d format is supported in this example");
  }

  return function parseTime(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;

    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    // Check if the date is valid
    if (isNaN(date.getTime())) return null;

    return date;
  };
}

// Parses dates from the sql query
export function processDates(data) {
  const parseTime = createTimeParse("%Y-%m-%d");

  return data.map(d => ({
    ...d,
    start_date: parseTime(d.start_date),
    end_date: parseTime(d.end_date),
    mise_a_jour_date: parseTime(d.mise_a_jour_date),
    date_dernier_rapport: parseTime(d.date_dernier_rapport),
    end_date: parseTime(d.end_date),
    calculated_end_date: parseTime(d.calculated_end_date)
  }));
}

export function createDebouncedSearch(callback, delay = 400) {
  let debounceTimer;
  return function(searchTerm) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(searchTerm);
    }, delay);
  };
}
