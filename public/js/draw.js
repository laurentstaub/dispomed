import { dataManager } from "./01_store_data.js";
import { fetchTableChartData, fetchSearchSuggestions } from "./00_fetch_data.js";
import { getDaysBetween, formatDurationSince, getProductStatus } from "./utils.js";

const ALL_TIME_START = new Date(2021, 4, 1);

let rawData = [];
let monthlyData = [];

function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const frFr = d3.timeFormatLocale({
  dateTime: "%A %e %B %Y à %X",
  date: "%d/%m/%Y",
  time: "%H:%M:%S",
  periods: ["", ""],
  days: [ "dimanche", "lundi", "mardi",
    "mercredi", "jeudi", "vendredi","samedi",
  ],
  shortDays: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
  months: [ "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ],
  shortMonths: ["Janv.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."],
});

const formatDate = frFr.format("%e %B %Y");
const formatDateShort = frFr.format("%b");

function getWindowWidth() {
  return window.innerWidth;
}

function shouldShowMarkForMonth(date, monthsToShow) {
  // Always show the current month
  const dateReport = dataManager.getDateReport();
  if (date.getTime() === new Date(dateReport).setDate(1)) {
    return true;
  }

  // For views of 24 months or more, only show quarterly (Jan, Apr, Jul, Oct)
  if (monthsToShow >= 24) {
    return date.getMonth() % 3 === 0; // Show only for months 0 (Jan), 3 (Apr), 6 (Jul), 9 (Oct)
  }

  // Otherwise show all monthly marks
  return true;
}

function identifyRecentStatusChanges(data, recentDays = 7) {
  const dateReport = dataManager.getDateReport();
  const recentDate = new Date(dateReport);
  recentDate.setDate(recentDate.getDate() - recentDays);

  // Products with recently started incidents
  const recentlyStarted = data.filter(d => {
    return d.start_date >= recentDate && d.start_date <= dateReport;
  });

  // Products with recently ended incidents
  const recentlyEnded = data.filter(d => {
    return d.calculated_end_date >= recentDate && d.end_date;
  });

  // Create a map with products as keys and their change type as values
  const productChanges = new Map();

  recentlyStarted.forEach(d => {
    productChanges.set(d.product, {
      type: 'started',
      status: d.status,
      date: d.start_date,
      incident: d
    });
  });

  recentlyEnded.forEach(d => {
    // Only add if not already in the map, or if this end date is more recent
    if (!productChanges.has(d.product) ||
        productChanges.get(d.product).date < d.calculated_end_date) {
      productChanges.set(d.product, {
        type: 'ended',
        status: d.status,
        date: d.calculated_end_date,
        incident: d
      });
    }
  });

  return productChanges;
}

let windowWidth = getWindowWidth();

const labelFontSizeScale = d3
  .scaleLinear()
  .domain([400, 900])
  .range([18, 12])
  .clamp(true);

/**
 * Returns the number of spécialités (CIS codes) for a product.
 * @param {object} product - The product object
 * @returns {number} The number of spécialités
 */
function getSpecialiteCount(product) {
  if (Array.isArray(product.cis_codes) && product.cis_codes.length > 0) {
    return product.cis_codes.length;
  }
  return 1;
}

function formatDuration(years, months, days) {
  const parts = [];
  const pluralize = (value, singular, plural) =>
    value > 0 ? `${value} ${value === 1 ? singular : plural}` : '';

  const yearsPart = pluralize(years, 'an', 'ans');
  const monthsPart = pluralize(months, 'mois', 'mois');
  const daysPart = pluralize(days, 'jour', 'jours');

  if (yearsPart) parts.push(yearsPart);
  if (monthsPart) parts.push(monthsPart);
  if (daysPart) parts.push(daysPart);

  if (parts.length === 0) return '0 jour';

  return parts.join(', ').replace(/, ([^,]*)$/, ' et $1');
}

function daysToYearsMonths(numberOfDays) {
  if (!numberOfDays) return '0 jour';
  const daysInAYear = 365;
  const daysInAMonth = 30;
  const years = Math.floor(numberOfDays / daysInAYear);
  const remainingDays = numberOfDays - years * daysInAYear;
  const months = Math.floor(remainingDays / daysInAMonth);
  const days = remainingDays - months * daysInAMonth;

  return formatDuration(years, months, days);
}

function debounce(func, delay) {
  let debounceTimer;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(debounceTimer);
      func(...args);
    };
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(later, delay);
  };
}

function createDebouncedSearch(callback, delay = 400) {
  let debounceTimer;
  return function (searchTerm) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(searchTerm);
    }, delay);
  };
}

async function handleSearch(searchTerm) {
  const monthsToShow = dataManager.getMonthsToShow();
  const atcClass = dataManager.getATCClass();
  const molecule = dataManager.getMolecule();

  rawData = await fetchTableChartData(monthsToShow,
    searchTerm, atcClass, molecule);
  monthlyData = dataManager.processDataMonthlyChart(rawData);
  drawTableChart(rawData);
  drawSummaryChart(monthlyData);

  // Only update the molecule dropdown when ATC class changes
  // This prevents the dropdown from disappearing when a molecule is selected
  if (molecule === "") {
    updateMoleculeDropdown(atcClass);
  }
}

function updateMoleculeDropdown(atcClass) {
  const moleculeSelect = d3.select("#molecule");
  const selectedMoleculeId = dataManager.getMolecule();
  let rawMolecules = dataManager.getMoleculeClassMap();

  if (atcClass !== "") {
    rawMolecules = rawMolecules.filter((mol) => mol.atcClass.slice(0, 1) === atcClass);
  }

  const molecules = rawMolecules.map((mol) => {
    return { code: mol.moleculeId, name: mol.moleculeName };
  });

  // Update dropdown options
  const options = moleculeSelect.selectAll("option")
    .data([{ code: "", name: "Choisir une molécule" }, ...molecules]);

  // Remove old options
  options.exit().remove();

  // Update existing options
  options.text((d) => d.name)
    .attr("value", (d) => d.code);

  // Add new options
  options.enter()
    .append("option")
    .text((d) => d.name)
    .attr("value", (d) => d.code);

  // Set selected option
  if (selectedMoleculeId) {
    moleculeSelect
      .selectAll(`option[value='${selectedMoleculeId}']`)
      .attr("selected", "selected");
  }
}

/***************************/
/*        Listeners        */
/***************************/
window.addEventListener(
  "resize",
  debounce(() => {
    windowWidth = getWindowWidth();
    // No need to reprocess data on resize - just redraw with existing data
    drawTableChart(rawData);
    drawSummaryChart(monthlyData);
  }, 250),
);

// Set up debounced search to avoid querying too often
const debouncedSearch = createDebouncedSearch(handleSearch);

d3.select("#mainfilter-reset").on("click", function () {
  location.reload();
});

// Search dropdown functionality
let searchDropdown = null;
let isDropdownVisible = false;

function createSearchDropdown() {
  if (searchDropdown) return searchDropdown;

  // Create dropdown container
  const searchContainer = document.querySelector('#mainfilter-search-box').parentElement;
  searchContainer.style.position = 'relative';

  searchDropdown = document.createElement('div');
  searchDropdown.id = 'search-dropdown';
  searchDropdown.className = 'search-dropdown hidden';
  searchContainer.appendChild(searchDropdown);

  return searchDropdown;
}

function hideSearchDropdown() {
  if (searchDropdown) {
    searchDropdown.classList.add('hidden');
    isDropdownVisible = false;
  }
}

function showSearchDropdown() {
  if (searchDropdown) {
    searchDropdown.classList.remove('hidden');
    isDropdownVisible = true;
  }
}

async function updateSearchDropdown(searchTerm) {
  if (!searchTerm || searchTerm.length < 2) {
    hideSearchDropdown();
    return;
  }

  const dropdown = createSearchDropdown();
  const monthsToShow = dataManager.getMonthsToShow();
  
  try {
    const suggestions = await fetchSearchSuggestions(searchTerm, monthsToShow);
    
    if (suggestions.length === 0) {
      dropdown.innerHTML = '<div class="search-no-results">Aucun résultat trouvé</div>';
    } else {
      dropdown.innerHTML = suggestions.map(suggestion => {
        const statusBadge = getStatusBadgeHTML(suggestion);
        const filterBadge = suggestion.in_current_filter ? 
          '' : 
          '<span class="search-filter-badge">En dehors du filtre actuel</span>';
        
        return `
          <div class="search-suggestion" data-product-id="${suggestion.product_id}" data-in-filter="${suggestion.in_current_filter}">
            <div class="search-suggestion-content">
              <span class="search-suggestion-name">${suggestion.accented_product || suggestion.product}</span>
              ${statusBadge}
              ${filterBadge}
            </div>
          </div>
        `;
      }).join('');

      // Add click handlers to suggestions
      dropdown.querySelectorAll('.search-suggestion').forEach(item => {
        item.addEventListener('click', async (e) => {
          const productName = item.querySelector('.search-suggestion-name').textContent;
          const inCurrentFilter = item.dataset.inFilter === 'true';
          
          // Update search box
          document.querySelector('#mainfilter-search-box').value = productName;
          dataManager.setSearchTerm(removeAccents(productName.toLowerCase()));
          
          // Update filter states
          updateFilterStates();
          
          // If product is outside current filter, switch to "All time" and show notification
          if (!inCurrentFilter) {
            await switchToAllTimeFilter(productName);
          } else {
            // Just perform normal search
            handleSearch(dataManager.getSearchTerm());
          }
          
          hideSearchDropdown();
        });
      });
    }
    
    showSearchDropdown();
  } catch (error) {
    console.error('Error fetching search suggestions:', error);
    hideSearchDropdown();
  }
}

function getStatusBadgeHTML(suggestion) {
  // If we have current_status from API, use it
  if (suggestion.current_status) {
    const currentStatus = suggestion.current_status;
    return `<span class="search-status-badge status-${currentStatus.toLowerCase()}">${currentStatus}</span>`;
  }
  
  // Otherwise, calculate from the statuses string (fallback logic)
  if (!suggestion.statuses) {
    return '<span class="search-status-badge status-disponible">Disponible</span>';
  }
  
  const statuses = suggestion.statuses.split(', ');
  
  // Priority logic: Arret > Rupture > Tension > Disponible
  let primaryStatus = 'Disponible';
  if (statuses.includes('Arret')) {
    primaryStatus = 'Arret';
  } else if (statuses.includes('Rupture') && suggestion.in_current_filter) {
    primaryStatus = 'Rupture';
  } else if (statuses.includes('Tension') && suggestion.in_current_filter) {
    primaryStatus = 'Tension';
  }
  
  return `<span class="search-status-badge status-${primaryStatus.toLowerCase()}">${primaryStatus}</span>`;
}

async function switchToAllTimeFilter(productName) {
  // Change to "All time" filter (maximum months)
  dataManager.setMonthsToShow(60); // Large number to get all data
  
  // Try to find and update the time filter selector
  // Note: We need to check if there's a time filter selector in the UI
  // If not, the filter change will still work through dataManager
  
  // Show notification
  showFilterChangeNotification(`Filtre étendu pour afficher "${productName}"`);
  
  // Perform search with new filter
  handleSearch(dataManager.getSearchTerm());
}

function showFilterChangeNotification(message) {
  // Create or update notification
  let notification = document.getElementById('filter-change-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'filter-change-notification';
    notification.className = 'filter-notification';
    document.body.appendChild(notification);
  }
  
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fa-solid fa-info-circle"></i>
      <span>${message}</span>
      <button class="notification-close" onclick="this.parentElement.parentElement.classList.add('hidden')">
        <i class="fa-solid fa-times"></i>
      </button>
    </div>
  `;
  
  notification.classList.remove('hidden');
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 5000);
}

// Set up debounced search to avoid querying too often
const debouncedDropdownUpdate = createDebouncedSearch(updateSearchDropdown);

function updateFilterStates() {
  const hasSearchTerm = dataManager.getSearchTerm().length > 0;
  const atcSelect = d3.select("#atc");
  const moleculeSelect = d3.select("#molecule");
  
  if (hasSearchTerm) {
    // Disable ATC and molecule filters when search is active
    atcSelect.property("disabled", true)
      .style("opacity", "0.5")
      .style("cursor", "not-allowed");
    
    moleculeSelect.property("disabled", true)
      .style("opacity", "0.5")
      .style("cursor", "not-allowed");
      
    // Reset their values
    dataManager.setATCClass("");
    dataManager.setMolecule("");
    atcSelect.property("value", "");
    moleculeSelect.property("value", "");
  } else {
    // Enable ATC and molecule filters when search is cleared
    atcSelect.property("disabled", false)
      .style("opacity", "1")
      .style("cursor", "pointer");
    
    moleculeSelect.property("disabled", false)
      .style("opacity", "1")
      .style("cursor", "pointer");
  }
}

// Event listeners for search
d3.select("#mainfilter-search-box").on("input", function () {
  const searchTerm = removeAccents(this.value.toLowerCase());
  dataManager.setSearchTerm(searchTerm);
  
  // Update filter states based on search
  updateFilterStates();
  
  // Update dropdown with suggestions
  debouncedDropdownUpdate(searchTerm);
  
  // Also update the main results with original behavior
  debouncedSearch(searchTerm);
});

// Hide dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#mainfilter-search-box') && !e.target.closest('#search-dropdown')) {
    hideSearchDropdown();
  }
});

// Show dropdown when focusing on search box
d3.select("#mainfilter-search-box").on("focus", function () {
  const searchTerm = this.value.trim();
  if (searchTerm.length >= 2) {
    updateSearchDropdown(removeAccents(searchTerm.toLowerCase()));
  }
});


d3.select("#atc").on("input", function () {
  dataManager.setATCClass(this.value);
  dataManager.setMolecule("");
  d3.select("#molecule").property("value", "").dispatch("change");

  handleSearch(dataManager.getSearchTerm());
});

d3.select("#molecule").on("input", function () {
  const molecule = this.value;
  dataManager.setMolecule(molecule);

  // Don't rebuild the dropdown, just keep the current value
  const select = d3.select(this);

  // Set the correct option as selected
  select.selectAll("option")
    .property("selected", d => d && d.code === molecule);

  handleSearch(dataManager.getSearchTerm());
});

d3.select("#vaccines-filter").on("change", function() {
  dataManager.setVaccinesOnly(this.checked);
  handleSearch(dataManager.getSearchTerm());
});

// Replace button click handlers with radio change handlers
const periodRadios = document.querySelectorAll('.mainfilter-radio');
periodRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    const period = e.target.value;
    if (period === '12') {
  dataManager.setMonthsToShow(12);
  handleSearch(dataManager.getSearchTerm());
    } else if (period === '24') {
  dataManager.setMonthsToShow(24);
  handleSearch(dataManager.getSearchTerm());
    } else if (period === 'all') {
  const end = new Date(dataManager.getDateReport());
  const start = ALL_TIME_START;
  const yearsFromStart = end.getFullYear() - start.getFullYear();
  const monthsFromStart = end.getMonth() - start.getMonth();
  const monthsDiff = yearsFromStart * 12 + monthsFromStart + 1;

  dataManager.setMonthsToShow(monthsDiff);
  handleSearch(dataManager.getSearchTerm());
    }
});
});

// Set default selection
document.getElementById('period-12').checked = true;

async function initializeData() {
  rawData = await fetchTableChartData();
  monthlyData = dataManager.processDataMonthlyChart(rawData);

  d3.select("#mise-a-jour").text(
    `Mise à jour : ${formatDate(dataManager.getDateReport())}`,
  );
  drawTableChart(rawData);
  drawSummaryChart(monthlyData);
}

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeData);
} else {
  // DOM is already ready
  initializeData();
}

function showArretOnlyMessage(arretProducts) {
  // Show the summary container but display a custom message instead of chart
  d3.select("#summary").style("display", "block");
  
  // Clear any existing content
  d3.select("#summary").selectAll("*").remove();
  
  // Find the earliest Arret date
  const earliestArret = arretProducts.reduce((earliest, product) => {
    const productDate = new Date(product.start_date);
    return !earliest || productDate < earliest ? productDate : earliest;
  }, null);
  
  const arretDate = formatDate(earliestArret);
  const productCount = arretProducts.length;
  const productLabel = productCount === 1 ? 'Le produit a été arrêté' : 'Les produits ont été arrêtés';
  
  // Create message container
  const messageContainer = d3.select("#summary")
    .append("div")
    .attr("class", "arret-only-message")
    .style("text-align", "center")
    .style("padding", "40px 20px")
    .style("color", "var(--grisfonce)")
    .style("background", "rgba(150, 150, 150, 0.05)")
    .style("border-radius", "8px")
    .style("border", "1px solid rgba(150, 150, 150, 0.2)");
  
  // Add icon
  messageContainer.append("div")
    .style("font-size", "48px")
    .style("margin-bottom", "16px")
    .style("color", "var(--arret-bg)")
    .html("&#9888;"); // Warning triangle
  
  // Add title
  messageContainer.append("h3")
    .style("margin", "0 0 12px 0")
    .style("color", "var(--grisfonce)")
    .style("font-size", "18px")
    .text("Arrêt de commercialisation");
  
  // Add message
  messageContainer.append("p")
    .style("margin", "0")
    .style("font-size", "16px")
    .style("line-height", "1.4")
    .html(`${productLabel} depuis le <strong>${arretDate}</strong>`);
  
  // Add note if multiple products
  if (productCount > 1) {
    messageContainer.append("p")
      .style("margin", "8px 0 0 0")
      .style("font-size", "14px")
      .style("color", "var(--gris)")
      .text(`${productCount} produits concernés par cet arrêt`);
  }
}

/***********************************/
/*    Draw the top summary chart   */
/***********************************/
function drawSummaryChart(monthlyChartData) {
  const margin = { top: 70, right: 15, bottom: 35, left: 10 };
  const height = 380;
  const width = 600;
  const innerHeight = height - margin.top - margin.bottom;
  const innerWidth = width - margin.left - margin.right;

  const startDate = dataManager.getStartDate();
  const endDate = dataManager.getEndDate();
  const parseDate = d3.timeParse("%Y-%m-%d");
  
  // Parse dates only if they're strings (not already Date objects)
  monthlyChartData.forEach((d) => {
    if (typeof d.date === 'string') {
      d.date = parseDate(d.date);
    }
  });

  const dateReport = dataManager.getDateReport();

  // Early return if no data
  if (!monthlyChartData || monthlyChartData.length === 0) {
    d3.select("#summary").style("display", "none");
    return;
  }

  // Filter out months with no data
  const filteredData = monthlyChartData.filter(
      (d) => d.rupture > 0 || d.tension > 0,
  );

  // For 24+ months, only keep one point per quarter (Jan, Apr, Jul, Oct)
  let lineData = filteredData;
  if (dataManager.getMonthsToShow() >= 24) {
    lineData = filteredData.filter(d => [0, 3, 6, 9].includes(d.date.getMonth()));
  }

  // Check if we only have "Arret" products (no ruptures or tensions)
  if (filteredData.length === 0) {
    // Check if there are any Arret products in the raw data
    const arretProducts = rawData.filter(d => d.status === 'Arret');
    if (arretProducts.length > 0) {
      showArretOnlyMessage(arretProducts);
      return;
    } else {
      d3.select("#summary").style("display", "none");
      return;
    }
  }

  // Show the summary container if we have data to display
  d3.select("#summary").style("display", "block");

  // Create scales
  const xScale = d3.scaleTime()
      .domain([startDate, endDate])
      .range([0, innerWidth]);

  const yScale = d3.scaleLinear()
      .domain([0, d3.max(lineData, (d) => Math.max(d.rupture, d.tension))])
      .nice()
      .range([innerHeight, 0]);

    const xAxis = d3.axisBottom(xScale)
        .ticks(dataManager.getMonthsToShow() >= 24 ? d3.timeMonth.every(3) : d3.timeMonth.every(1))
        .tickFormat((d) => {
            if (d.getMonth() === 0) {
                return d3.timeFormat("%Y")(d);
            }
            return formatDateShort(d);
        })
        .tickSize(0) // Remove tick lines
        .tickPadding(12);


  // Create line generators
  const lineTension = d3.line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.tension))
      .defined((d) => d.tension > 0);

  const lineRupture = d3.line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.rupture))
      .defined((d) => d.rupture > 0);

  // Create SVG if initial setup
    let svg = d3.select("#summary svg");
    const isInitialSetup = svg.empty();

    if (isInitialSetup) {
    svg = d3.select("#summary")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");
  } else {
    // svg is already selected, just clear its contents
    svg.selectAll("*").remove();
  }

  const group = svg.append("g")
      .attr("transform", "translate(0, 0)");

  let titleContainer = d3.select("#summary .title-card");

  if (titleContainer.empty()) {
    titleContainer = d3.select("#summary")
        .insert("div", ":first-child")
        .attr("class", "title-card");

    titleContainer.html(`
        <div class="card-header">
          <h3 class="card-title">Évolution des ruptures et tensions</h3>
          <p class="card-subtitle">En nombre de spécialités (Codes CIS) manquantes le 1er de chaque période</p>
        </div>
    `);
  }

  const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
      .attr("class", "sumchart-x-axis")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(xAxis);

  // Style yearly tick
  g.selectAll(".sumchart-x-axis text")
      .filter((d) => d.getMonth() === 0)
      .style("font-weight", "bold")
      .style("fill", "#64748b");

  // Style month labels differently
  g.selectAll(".sumchart-x-axis text")
      .filter((d) => d.getMonth() !== 0)
      .style("fill", "#64748b");

  g.selectAll(".sumchart-x-axis text")
      .style("font-size", `${labelFontSizeScale(windowWidth)}px`,
      );

  // Draw lines
  g.append("path")
      .datum(lineData)
      .attr("class", "sumchart-tension-line")
      .attr("d", lineTension);

  g.append("path")
      .datum(lineData)
      .attr("class", "sumchart-rupture-line")
      .attr("d", lineRupture);

  // Add marks (circles) for rupture data points
    g.selectAll(".sumchart-rupture-mark")
        .data(lineData.filter((d) => d.rupture > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
        .enter()
        .append("circle")
        .attr("class", "sumchart-rupture-mark")
        .attr("cx", (d) => xScale(d.date))
        .attr("cy", (d) => yScale(d.rupture))
        .attr("r", 0) // Start at 0 for animation
        .style("fill", "white")
        .style("stroke", "#ef4444")
        .style("stroke-width", 2)
        .style("filter", "drop-shadow(0 4px 8px rgba(239, 68, 68, 0.2))")
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
            d3.select(this)
                .transition()
                .duration(100)
                .attr("r", 8)
                .style("stroke-width", 4);
        })
        .on("mouseout", function(event, d) {
            d3.select(this)
                .transition()
                .duration(100)
                .attr("r", 6)
                .style("stroke-width", 3);
        })
        .transition()
        .delay((d, i) => i * 50) // Staggered animation
        .duration(600)
        .ease(d3.easeBounceOut)
        .attr("r", 6);

  // Add marks (circles) for tension data points
    g.selectAll(".sumchart-tension-mark")
        .data(lineData.filter((d) => d.tension > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
        .enter()
        .append("circle")
        .attr("class", "sumchart-tension-mark")
        .attr("cx", (d) => xScale(d.date))
        .attr("cy", (d) => yScale(d.tension))
        .attr("r", 0) // Start at 0 for animation
        .style("fill", "white")
        .style("stroke", "#f59e0b")
        .style("stroke-width", 2)
        .style("filter", "drop-shadow(0 4px 8px rgba(245, 158, 11, 0.2))")
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("r", 8)
                .style("stroke-width", 4);
        })
        .on("mouseout", function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("r", 6)
                .style("stroke-width", 3);
        })
        .transition()
        .delay((d, i) => i * 50) // Staggered animation
        .duration(600)
        .ease(d3.easeBounceOut)
        .attr("r", 6);

  // Add labels for rupture data points
  g.selectAll(".sumchart-rupture-label")
      .data(lineData.filter((d) => d.rupture > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
      .enter()
      .append("text")
      .style("font-size", `${labelFontSizeScale(windowWidth)}px`)
      .attr("class", "sumchart-rupture-label")
      .attr("x", (d) => xScale(d.date))
      .attr("y", (d) => yScale(d.rupture) - 10)
      .attr("text-anchor", "middle")
      .text((d) => d.rupture);

  // Add labels for tension data points - WITH FILTERING
  g.selectAll(".sumchart-tension-label")
      .data(lineData.filter((d) => d.tension > 0 && shouldShowMarkForMonth(d.date, dataManager.getMonthsToShow())))
      .enter()
      .append("text")
      .style("font-size", `${labelFontSizeScale(windowWidth)}px`)
      .attr("class", "sumchart-tension-label")
      .attr("x", (d) => xScale(d.date))
      .attr("y", (d) => yScale(d.tension) - 10)
      .attr("text-anchor", "middle")
      .text((d) => d.tension);

  let currentRupture = 0;
  let currentTension = 0;

  rawData.forEach((product) => {
    if (product.start_date <= dateReport && product.calculated_end_date >= dateReport) {
      const count = getSpecialiteCount(product);
      if (product.status === "Rupture") {
        currentRupture += count;
      } else if (product.status === "Tension") {
        currentTension += count;
      }
    }
  });

  let currentMonthData = {
    date: dateReport,
    rupture: currentRupture,
    tension: currentTension
  };

  if (currentMonthData) {
    const dateObj = (dateReport instanceof Date ? dateReport : new Date(dateReport));

    // Calculate fixed x position for current label
    const lastMonthStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
    const lastMonthEnd = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0);
    const midMonthDate = new Date(lastMonthStart.getTime() + (lastMonthEnd.getTime() - lastMonthStart.getTime()) / 2);
    const labelX = xScale(midMonthDate);

    // Add white background rectangle
    const ruptureText = currentMonthData.rupture.toString();
    const fontSize = labelFontSizeScale(windowWidth);
    const textWidth = ruptureText.length * fontSize * 0.6; // Approximate text width
    const textHeight = fontSize;

    // Add rupture point if there are ruptures
    if (currentMonthData.rupture > 0) {
      // Add larger circle for current rupture total
      g.append("circle")
          .attr("class", "sumchart-current-point rupture-fill")
          .attr("cx", xScale(dateObj))
          .attr("cy", yScale(currentMonthData.rupture))
          .attr("r", 3);

      // Create a group for the current rupture label with background
      const ruptureGroup = g.append("g").attr("class", "current-label-group");

      ruptureGroup.append("rect")
          .attr("x", labelX - textWidth/2 - 2)
          .attr("y", yScale(currentMonthData.rupture) - textHeight - 10)
          .attr("width", textWidth + 4)
          .attr("height", textHeight + 2)
          .attr("fill", "var(--rupture)")
          .attr("rx", 2);

// Add the text label on top
      ruptureGroup.append("text")
          .attr("class", "sumchart-current-label")
          .attr("x", labelX)
          .attr("y", yScale(currentMonthData.rupture) - 10)
          .attr("text-anchor", "middle")
          .attr("fill", "var(--blanc  )")
          .style("font-size", `${fontSize}px`)
          .style("font-weight", "700")
          .text(currentMonthData.rupture);
    }

    // Add tension point if there are tensions
    if (currentMonthData.tension > 0) {
      // Add larger circle for current tension total
      g.append("circle")
        .attr("class", "sumchart-current-point tension-fill")
        .attr("cx", xScale(dateObj))
        .attr("cy", yScale(currentMonthData.tension))
        .attr("r", 3);

      // Create a group for the current tension label with background
      const tensionGroup = g.append("g").attr("class", "current-label-group");
      const tensionText = currentMonthData.tension.toString();
      const tensionTextWidth = tensionText.length * fontSize * 0.6;

      tensionGroup.append("rect")
        .attr("x", labelX - tensionTextWidth/2 - 2)
        .attr("y", yScale(currentMonthData.tension) - textHeight - 10)
        .attr("width", textWidth + 10)
        .attr("height", textHeight + 4)
        .attr("fill", "var(--tension)")
        .attr("rx", 2);

      // Add the text label on top
      tensionGroup.append("text")
        .attr("class", "sumchart-current-label")
        .attr("x", labelX)
        .attr("y",  yScale(currentMonthData.tension) - 10)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--blanc)")
        .style("font-size", `${fontSize}px`)
        .style("font-weight", "700")
        .text(currentMonthData.tension);
    }
  }
}
/***************************/
/* Create the table chart  */
/***************************/
function getLabelWidth() {
  const root = document.documentElement;
  const isMobile = window.innerWidth <= 700;
  const varName = isMobile ? '--label-width-mobile' : '--label-width';
  const value = getComputedStyle(root).getPropertyValue(varName);
  return parseInt(value, 10) || (isMobile ? 70 : 180); // fallback
}

function drawTableChart(rawData) {
  const dash = d3.select('#maintbl-dash');
  dash.html('<div class="card-title">Détail des incidents: produits, statut et durée de chaque incident</div>');

  // Dynamically measure container width after clearing
  let containerWidth = 900;
  const dashNode = dash.node();
  if (dashNode) {
    const measured = dashNode.getBoundingClientRect().width;
    if (measured && measured > 0) {
      containerWidth = measured;
    } else {
      containerWidth = Math.min(containerWidth, window.innerWidth);
    }
  }

  const products = dataManager.getProducts();
  const accentedProducts = dataManager.getAccentedProducts();
  const dateReport = dataManager.getDateReport();
  const startDate = dataManager.getStartDate();
  const endDate = dataManager.getEndDate();
  const rowHeight = 23;
  const barHeight = 15;

  // Identify recently changed products (last 7 days)
  const recentChangesMap = identifyRecentStatusChanges(rawData, 7);
  const recentlyChangedProducts = Array.from(recentChangesMap.keys());

  // Sort products: recently changed first, then the rest
  const sortedProducts = [
    ...recentlyChangedProducts,
    ...products.filter(p => !recentlyChangedProducts.includes(p))
  ];

  // Tooltip (reuse or create)
  let tooltip = d3.select('body').select('#tooltip');
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('id', 'tooltip');
  }

  const isMobile = window.innerWidth <= 700;

  // Responsive layout values
  const iconWidth = isMobile ? 16 : 20;
  const labelWidth = getLabelWidth();
  const statusBoxWidth = isMobile ? 6 : 8;
  const gap = isMobile ? 6 : 12;
  const padding = 8;
  const totalPadding = padding * 2; // Left and right padding
  const totalGaps = gap * 2; // Gaps between elements
  const reservedWidth = iconWidth + labelWidth + statusBoxWidth + totalGaps + totalPadding;

    const svgWidth = Math.max(
        50,
        Math.min(900, containerWidth) - reservedWidth
    );


  // Add section title row before the first recently changed product
  let addedSectionTitle = false;
  let recentBlock = null;
  let addedOtherTitle = false;

  sortedProducts.forEach((product, i) => {
    // Insert section title row before the first recently changed product
    if (!addedSectionTitle && recentlyChangedProducts.includes(product)) {
      dash.append('div')
        .attr('class', 'recent-changes-title-row')
        .text('Changements de statut ces 7 derniers jours');
      recentBlock = dash.append('div').attr('class', 'recent-changes-block');
      addedSectionTitle = true;
    }

    // Add title for other products
    if (!recentlyChangedProducts.includes(product) && !addedOtherTitle) {
      dash.append('div')
        .attr('class', 'other-changes-title-row')
        .text('Autres situations de disponibilité');
      addedOtherTitle = true;
    }

    const productIncidents = rawData.filter(d => d.product === product);
    const mainIncident = productIncidents[0] || {};
    const status = getProductStatus(mainIncident, dateReport);

    // Add background for recently changed products
    const isRecentlyChanged = recentlyChangedProducts.includes(product);

    // Row container: use recentBlock for recently changed, dash for others
    const parent = isRecentlyChanged && recentBlock ? recentBlock : dash;
    const row = parent.append('div')
      .attr('class', `maintbl-row-modern hover-${status.shorthand}${isRecentlyChanged ? ' recently-changed-row' : ''}`)
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('min-height', rowHeight + 'px')
      .style('position', 'relative');

    // Status icon
    row.append('span')
      .style('width', iconWidth + 'px')
      .style('text-align', 'center')
      .style('flex-shrink', '0')
      .html(`<i class="${status.icon}" style="color:${status.color}; font-size: 14px;"></i>`);

    // Product label - improved truncation
    const label = accentedProducts[i];
    let shortLabel = label;
    const commaCount = (label.match(/,/g) || []).length;
    if (commaCount === 1) {
      shortLabel = label.split(',')[0];
    }
    row.append('a')
    .attr('class', 'maintbl-row-label')
    .attr('href', `/product/${mainIncident.product_id}`)
    .text(shortLabel)
      .on('mouseover', function () {
        let tooltipContent = `<div class="tooltip-title">${accentedProducts[i]}</div>`;
        tooltipContent += `<div class="tooltip-dci">DCI: ${mainIncident.molecule || ''} / ATC: ${mainIncident.atc_code || ''}</div>`;
        if (status.shorthand === 'rupture' || status.shorthand === 'tension') {
          if (mainIncident.start_date <= dateReport && mainIncident.calculated_end_date >= dateReport) {
            const diffInDays = getDaysBetween(mainIncident.start_date, dateReport);
            tooltipContent += `<div class="tooltip-status ${status.shorthand}"><i class="${status.icon}"></i> ${status.text} ${formatDurationSince(diffInDays)}</div>`;
          }
        } else {
          tooltipContent += `<div class="tooltip-status ${status.shorthand}"><i class="${status.icon}"></i> ${status.text}</div>`;
        }
        // Add CIS codes list as last item
        if (mainIncident.cis_codes && mainIncident.cis_codes.length > 0) {
          tooltipContent += '<div class="tooltip-cis-list"><b>Codes CIS concernés :</b><ul>';
          mainIncident.cis_codes.forEach(code => {
            const name = mainIncident.cis_names && mainIncident.cis_names[code] ? mainIncident.cis_names[code] : '';
            tooltipContent += `<li class="tooltip-cis-item">${code}${name ? ': ' + name : ''}</li>`;
          });
          tooltipContent += '</ul></div>';
        }
        tooltip.transition().duration(200).style('opacity', 1);
        tooltip.html(tooltipContent).attr('class', status.class);
        const labelBox = this.getBoundingClientRect();
        let top = labelBox.bottom + window.scrollY + 5;
        let left = labelBox.left + window.scrollX;
        tooltip.style('left', left + 'px').style('top', top + 'px');
      })
      .on('mouseout', function () {
        tooltip.transition().duration(500).style('opacity', 0);
      });

    const barContainer = row.append('span')
      .style('flex', '1')
      .style('position', 'relative')
      .style('height', rowHeight + 'px')
      .style('margin-right', (statusBoxWidth + 2) + 'px')
      .style('min-width', '0');

    const svg = barContainer.append('svg')
      .attr('width', svgWidth)
      .attr('height', rowHeight);

    const xScale = d3.scaleTime().domain([startDate, endDate]).range([0, svgWidth]);

    // Timeline background
    svg.append('line')
      .attr('x1', 0)
      .attr('x2', xScale(dateReport))
      .attr('y1', rowHeight / 2)
      .attr('y2', rowHeight / 2)
      .attr('stroke', 'var(--vertleger)')
      .attr('stroke-width', 15);

    // Bars
    productIncidents.forEach(d => {
      const barStart = d.start_date > startDate ? d.start_date : startDate;
      const barEnd = d.status === 'Arret' && !d.end_date ? dateReport : d.calculated_end_date;

      svg.append('rect')
        .attr('x', xScale(barStart))
        .attr('y', (rowHeight - barHeight) / 2)
        .attr('width', Math.max(2, xScale(barEnd) - xScale(barStart)))
        .attr('height', barHeight)
        .attr('class', `bar ${d.status}-fill`.toLowerCase())
        .style('cursor', 'pointer')
        .on('mousemove', function (event) {
          let tooltipHTML = `
            <div class="tooltip-title">${d.accented_product || d.product}</div>
            <div class="tooltip-dci">DCI: ${d.molecule || ''}</div>
          `;

          const isOngoing = !d.end_date || (d.calculated_end_date && d.calculated_end_date >= dateReport);
          const start = formatDate(d.start_date);
          const startDateObj = new Date(d.start_date);
          const endDateObj = isOngoing ? dateReport : new Date(d.end_date || d.calculated_end_date);
          const end = formatDate(endDateObj);

          const diffDays = getDaysBetween(startDateObj, endDateObj);
          const duration = daysToYearsMonths(diffDays);

          if (d.status === 'Arret') {
            tooltipHTML += `
              <div class="tooltip-status arret">
                Arrêt de commercialisation / ${isOngoing ? 'En cours' : 'Terminé'}<br>
                ${isOngoing
                  ? `Depuis le ${start}`
                  : `Du ${start} au ${end}`
                } (${duration})
              </div>
            `;
          } else if (d.status === 'Rupture' || d.status === 'Tension') {
            tooltipHTML += `
              <div class="tooltip-status ${d.status.toLowerCase()}">
                ${d.status} / ${isOngoing ? 'En cours' : 'Terminé'}<br>
                ${isOngoing
                  ? `Depuis le ${start}`
                  : `Du ${start} au ${end}`
                } (${duration})
              </div>
            `;
          } else if (d.status === 'Disponible') {
            tooltipHTML += `
              <div class="tooltip-status disponible">
                Disponible
              </div>
            `;
          }

          tooltip.html(tooltipHTML).attr('class', `tooltip-${d.status.toLowerCase()}`);

          // Tooltip positioning: below the bar, left-aligned with bar, or right-aligned if not enough space
          const svgRect = svg.node().getBoundingClientRect();
          const barX = xScale(barStart);
          const barW = Math.max(2, xScale(barEnd) - xScale(barStart));
          const barY = (rowHeight - barHeight) / 2;
          // Get the bar's left edge in page coordinates
          const leftEdge = svgRect.left + barX + window.scrollX;
          const topEdge = svgRect.top + barY + barHeight + window.scrollY;

          // Default: tooltip left edge at bar left
          let left = leftEdge;
          let top = topEdge + 2; // 2px gap below bar

          // If tooltip would overflow right, align with bar's right edge
          const tooltipNode = tooltip.node();
          if (tooltipNode) {
            const tooltipWidth = tooltipNode.offsetWidth;
            const barRight = leftEdge + barW;
            if (left + tooltipWidth > window.innerWidth - 8) { // 8px margin
              left = Math.max(8, barRight - tooltipWidth);
            }
          }

          tooltip.style('left', left + 'px').style('top', top + 'px').style('opacity', 1);
        })
        .on('mouseout', function () {
          tooltip.style('opacity', 0);
        });
    });

    // Status box at report date
    svg.append('rect')
      .attr('x', xScale(dateReport) - statusBoxWidth / 2)
      .attr('y', (rowHeight - (isMobile ? 15 : 17)) / 2)
      .attr('width', statusBoxWidth)
      .attr('height', isMobile ? 15 : 17)
      .style('fill', status.color);
  });
}
