import { config } from '/src/availability_config.js';

export function customSort(a, b) {
  const dateLastReport = config.report.getDateLastReport();
  const aIsActive = a.end_date >= dateLastReport;
  const bIsActive = b.end_date >= dateLastReport;

  // First, sort by active status
  if (aIsActive && !bIsActive) return -1;
  if (!aIsActive && bIsActive) return 1;

  // If both are active or both are inactive, sort by status
  if (aIsActive === bIsActive) {
    if (a.status === "Rupture" && b.status !== "Rupture") return -1;
    if (a.status !== "Rupture" && b.status === "Rupture") return 1;
    if (a.status === "Tension" && b.status !== "Tension") return -1;
    if (a.status !== "Tension" && b.status === "Tension") return 1;

    // If status is the same, sort by startDate (most recent first)
    return new Date(b.start_date) - new Date(a.start_date);
  }

  // If we reach here, one is active and one is inactive, but this is handled above
  return 0;
}

export function getProductStatus(d) {
  const dateLastReport = config.report.getDateLastReport();

  if (d.status === "arret") {
    return { text: "Arrêt de commercialisation", class: "tooltip-arret" };
  } else if (d.start_date <= dateLastReport && d.end_date >= dateLastReport) {
    if (d.status === "Rupture") {
      return { text: "Rupture de stock", class: "tooltip-rupture" };
    } else if (d.status === "Tension") {
      return { text: "Tension d'approvisionnement", class: "tooltip-tension" };
    } else if (d.status === "Arret") {
      return { text: "Arrêt de commercialisation", class: "tooltip-arret" };
    }
  } else if (!d.end_date || d.end_date < dateLastReport) {
      return { text: "Disponible", class: "tooltip-disponible" };
  }
  return { text: "Statut inconnu", class: "" };
}

export function getUniqueProductLength(eventList) {
  let result = [];

  eventList.forEach(event => {
    if (!result.includes(event.product)) result.push(event.product);
  })

  return result.length;
}

export function processDates(data) {
  const parseTime = d3.timeParse("%Y-%m-%d");

  return data.map(d => ({
    ...d,
    start_date: parseTime(d.start_date),
    end_date: parseTime(d.end_date),
    mise_a_jour_date: parseTime(d.mise_a_jour_date),
    date_dernier_rapport: parseTime(d.date_dernier_rapport),
    end_date: d.end_date ? parseTime(d.end_date) : new Date(Math.max(
      d.mise_a_jour_date ? parseTime(d.mise_a_jour_date) : 0,
      d.date_dernier_rapport ? parseTime(d.date_dernier_rapport) : 0
    ))
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
