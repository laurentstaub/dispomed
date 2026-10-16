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
    return { text: "Arrêt de commercialisation", class: "tooltip-arret", shorthand: "arret", color: "var(--statut-arret)", icon: "square-xmark" };
  } else if (
    new Date(incident.start_date) <= dateReport &&
    new Date(incident.calculated_end_date) >= dateReport &&
    incident.end_date === null
  ) {
    if (incident.status === "Rupture") {
      return { text: "Rupture de stock", class: "tooltip-rupture", shorthand: "rupture", color: "var(--statut-rupture)", icon: "square-xmark" };
    } else if (incident.status === "Tension") {
      return { text: "Tension d'approvisionnement", class: "tooltip-tension", shorthand: "tension", color: "var(--statut-tension)", icon: "square-minus" };
    }
  } else if (
    !incident.calculated_end_date ||
    new Date(incident.calculated_end_date) < dateReport ||
    incident.end_date
  ) {
    return { text: "Disponible", class: "tooltip-disponible", shorthand: "disponible", color: "var(--statut-disponible)", icon: "square-check" };
  }
  return { text: "Statut inconnu", class: "", shorthand: "inconnu", color: "var(--faint)", icon: "square-question" };
}

/* Icônes inline (remplacent Font Awesome). Mêmes tracés que la mixin
   views/mixins/icones.pug : toute modification se fait aux deux endroits.
   1 em, couleur courante ; le creux des carrés prend la couleur du fond. */
const CARRE = '<rect width="16" height="16" rx="2" fill="currentColor"/>';
const TRAIT = 'stroke="var(--bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"';
const ICONES = {
  "square-xmark": CARRE + `<path d="M5 5l6 6M11 5l-6 6" ${TRAIT}/>`,
  "square-minus": CARRE + `<path d="M4 8h8" ${TRAIT}/>`,
  "square-check": CARRE + `<path d="M4 8.5l2.5 2.5L12 5.5" ${TRAIT}/>`,
  "square-question": CARRE + `<path d="M5.5 6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .7-1 1.4" ${TRAIT}/><circle cx="8" cy="12.2" r="1" fill="var(--bg)"/>`,
  "arrow-left": '<path d="M14 8H3M7 4L3 8l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  "chevron-down": '<path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  "info-circle": '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="4.6" r="1" fill="currentColor"/>',
  "times": '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

/**
 * Icône SVG inline, 1 em, en couleur courante.
 * @param {string} nom - clé de ICONES (ex. "square-xmark")
 * @param {{classe?: string, style?: string}} [opts] - classes et style ajoutés au <svg>
 * @returns {string} balise <svg> prête à insérer
 */
function icone(nom, opts = {}) {
  const corps = ICONES[nom] || ICONES["square-question"];
  const classe = opts.classe ? ` ${opts.classe}` : "";
  const style = opts.style ? ` style="${opts.style}"` : "";
  return `<svg class="ico${classe}" viewBox="0 0 16 16" aria-hidden="true"${style}>${corps}</svg>`;
}

export { formatDurationSince, getDaysBetween, getProductStatus, icone };