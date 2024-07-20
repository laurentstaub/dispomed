import { tableConfig } from '/src/availability_config.js';

export function customSort(a, b) {
  const dateLastReport = tableConfig.getDateLastReport();
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
  const dateLastReport = tableConfig.getDateLastReport();

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

export function hasEventInChartPeriod(event) {
  return !(event.end_date <= tableConfig.startDateChart);
}

export function getUniqueProductLength(eventList) {
  let result = [];

  eventList.forEach(event => {
    if (!result.includes(event.product)) result.push(event.product);
  })

  return result.length;
}
