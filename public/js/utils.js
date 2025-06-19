/**
 * Format a duration in days into a human-readable string in French
 * @param {number} diffDays - Number of days to format
 * @returns {string} Formatted duration string (e.g. "depuis 3 mois", "depuis 2 semaines")
 */
function formatDurationSince(diffDays) {
  if (diffDays < 7) {
    return `depuis ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  } else if (diffDays < 30) {
    const weeks = Math.round(diffDays / 7);
    return `depuis ${weeks} semaine${weeks > 1 ? 's' : ''}`;
  } else if (diffDays < 365) {
    const months = Math.round(diffDays / 30);
    return `depuis ${months} mois`;
  } else {
    const years = Math.round(diffDays / 365);
    return `depuis ${years} an${years > 1 ? 's' : ''}`;
  }
}

/**
 * Calculate the number of days between two dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} Number of days between the dates
 */
function getDaysBetween(startDate, endDate) {
  const diffMs = endDate - startDate;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get the current status of a product incident as of a given date (defaults to today)
 * @param {object} incident - The incident object
 * @param {Date} [dateReport=new Date()] - The date to check status for
 * @returns {object} Status object with text, class, shorthand, color, and icon
 */
function getProductStatus(incident, dateReport) {
  if (incident.status === "Arret") {
    return { text: "Arrêt de commercialisation", class: "tooltip-arret", shorthand: "arret", color: "var(--arret-bg)", icon: "fa-solid fa-square-xmark" };
  } else if (
    new Date(incident.start_date) <= dateReport &&
    new Date(incident.calculated_end_date) >= dateReport &&
    incident.end_date === null
  ) {
    if (incident.status === "Rupture") {
      return { text: "Rupture de stock", class: "tooltip-rupture", shorthand: "rupture", color: "var(--rupture)", icon: "fa-solid fa-square-xmark" };
    } else if (incident.status === "Tension") {
      return { text: "Tension d'approvisionnement", class: "tooltip-tension", shorthand: "tension", color: "var(--tension)", icon: "fa-solid fa-square-minus" };
    }
  } else if (
    !incident.calculated_end_date ||
    new Date(incident.calculated_end_date) < dateReport ||
    incident.end_date
  ) {
    return { text: "Disponible", class: "tooltip-disponible", shorthand: "disponible", color: "var(--disponible)", icon: "fa-solid fa-square-check" };
  }
  return { text: "Statut inconnu", class: "", shorthand: "inconnu", color: "var(--grisleger)", icon: "fa-solid fa-square-question" };
}

export { formatDurationSince, getDaysBetween, getProductStatus };