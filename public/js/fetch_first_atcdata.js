// This is used for the initial load of ATC lasses and molecules
const ATCDataManager = (function () {
  let atcClasses = [];
  let allMolecules = [];
  let atcMoleculeMap = {};

  async function fetchAndInitialize(monthsToShow) {
    const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
    const queryString = new URLSearchParams({
      monthsToShow: monthsToShow,
    }).toString();
    const url = `${API_BASE_URL}/api/incidents/ATCClasses${queryString ? "?" + queryString : ""}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    const atcClassesMap = new Map();
    const moleculesSet = new Set();
    const tempAtcMoleculeMap = new Map();

    console.log(data);
    data.forEach((row) => {
      atcClassesMap.set(row.atc_code, row.atc_description);

      if (row.molecule_id && row.molecule_name) {
        const molecule = { code: row.molecule_id, name: row.molecule_name };
        moleculesSet.add(JSON.stringify(molecule));

        if (!tempAtcMoleculeMap.has(row.atc_code)) {
          tempAtcMoleculeMap.set(row.atc_code, new Set());
        }
        tempAtcMoleculeMap.get(row.atc_code).add(JSON.stringify(molecule));
      }
    });

    atcClasses = Array.from(atcClassesMap, ([code, description]) => ({
      code,
      description,
    })).sort((a, b) => a.code.localeCompare(b.code));

    allMolecules = Array.from(moleculesSet)
      .map(JSON.parse)
      .sort((a, b) => a.name.localeCompare(b.name));

    atcMoleculeMap = Object.fromEntries(
      Array.from(tempAtcMoleculeMap, ([code, molecules]) => [
        code,
        Array.from(molecules)
          .map(JSON.parse)
          .sort((a, b) => a.name.localeCompare(b.name)),
      ]),
    );
  }

  function getATCClasses() {
    return atcClasses;
  }

  function getMolecules() {
    return allMolecules;
  }

  function getMoleculeMap() {
    return atcMoleculeMap;
  }

  return {
    fetchAndInitialize,
    getATCClasses,
    getMolecules,
    getMoleculeMap,
  };
})();

export default ATCDataManager;
