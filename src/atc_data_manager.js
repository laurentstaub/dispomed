const ATCDataManager = (function() {
  let atcClasses = [];
  let allMolecules = [];
  let atcMoleculeMap = {};

  async function fetchAndInitialize(monthsToShow) {
    try {
      const baseUrl = 'http://localhost:3000'; // Or your server's base URL
      const queryString = new URLSearchParams({ monthsToShow: monthsToShow }).toString();
      const url = `${baseUrl}/api/incidents/ATCClasses${queryString ? '?' + queryString : ''}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      const atcClassesMap = new Map();
      const moleculesSet = new Set();
      const tempAtcMoleculeMap = new Map();

      data.forEach(row => {
        atcClassesMap.set(row.atc_code, row.atc_description);

        if (row.molecule_id && row.molecule_name) {
          const molecule = { id: row.molecule_id, name: row.molecule_name };
          moleculesSet.add(JSON.stringify(molecule));

          if (!tempAtcMoleculeMap.has(row.atc_code)) {
            tempAtcMoleculeMap.set(row.atc_code, new Set());
          }
          tempAtcMoleculeMap.get(row.atc_code).add(JSON.stringify(molecule));
        }
      });

      atcClasses = Array.from(atcClassesMap, ([code, description]) => ({ code, description }))
        .sort((a, b) => a.code.localeCompare(b.code));

      allMolecules = Array.from(moleculesSet)
        .map(JSON.parse)
        .sort((a, b) => a.name.localeCompare(b.name));

      atcMoleculeMap = Object.fromEntries(
        Array.from(tempAtcMoleculeMap, ([code, molecules]) => [
          code,
          Array.from(molecules).map(JSON.parse).sort((a, b) => a.name.localeCompare(b.name))
        ])
      );
    } catch (error) {
      console.error('Error fetching ATC classes:', error);
    }
  }

  function getATCClasses() {
    return atcClasses;
  }

  function getAllMolecules() {
    return allMolecules;
  }

  function getMolecules(atcCode = null) {
    if (atcCode) {
    return atcMoleculeMap;
    }
    return allMolecules;
  }

  function getMoleculeMap () {
    return atcMoleculeMap;
  }

  return {
    fetchAndInitialize,
    getATCClasses,
    getAllMolecules,
    getMolecules,
    getMoleculeMap,
  };
})();

export default ATCDataManager;
