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

export { formatDurationSince, getDaysBetween };