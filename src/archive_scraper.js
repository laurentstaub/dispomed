import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { saveDataJson, convertFrenchDateToISO } from "./utils.js";

const urlToFetch =
  "https://ansm.sante.fr/disponibilites-des-produits-de-sante/medicaments";

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0; // Warning: Only use for development

(async () => {
  try {
    const response = await fetch(urlToFetch);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const body = await response.text();
    const $ = cheerio.load(body);
    const table = $("table");

    const tableData = [];

    const headers = [];
    $("table th").each((i, header) => {
      headers.push($(header).text().trim());
    });

    table.find("tr").each((i, row) => {
      const rowData = {};
      $(row)
        .find("td")
        .each((j, cell) => {
          const cellText = $(cell).text().trim();
          if (headers[j] === "Mise à jour") {
            rowData[headers[j]] = convertFrenchDateToISO(cellText);
          } else {
            rowData[headers[j]] = cellText;
          }
        });
      if (i > 0) tableData.push(rowData);
    });

    const savedFilePath = await saveDataJson(tableData);
    console.log(`Data saved to ${savedFilePath}`);
  } catch (error) {
    console.error("Failed to fetch and process the data:", error);
  }
})();
