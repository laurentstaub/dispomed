import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { saveDataJson, convertFrenchDateToISO, fetchLinkedPage } from "./utils.js";

const prefixUrl = ""
const baseUrl = "https://ansm.sante.fr";
const urlToFetch = `${prefixUrl}${baseUrl}/disponibilites-des-produits-de-sante/medicaments`;

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

    const rows = table.find("tr").toArray();

    for (const row of rows) {
      const rowData = {};
      const dataHref = $(row).attr("data-href");
      if (dataHref) {
        const linkedUrl = `${prefixUrl}${baseUrl}${dataHref}`;
        const linkedPageData = await fetchLinkedPage(linkedUrl);
        rowData["Linked Page Title"] = linkedPageData.pageTitle;
        rowData["Linked Page Data"] = linkedPageData.info;
      }

      $(row)
        .find("td")
        .each((j, cell) => {
          const cellText = $(cell).text().trim();

          // deals with some older files format from 2021
          if (headers[j] === "Publication") headers[j] = "Mise à jour";
          // converts date in Mise à jour and Remise à disposition columns
          if (headers[j] === "Mise à jour" || headers[j] === "Remise à disposition") {
            rowData[headers[j]] = convertFrenchDateToISO(cellText);
          } else {
            rowData[headers[j]] = cellText;
          }
        });
      if (Object.keys(rowData).length > 0) tableData.push(rowData);
    }

    const savedFilePath = await saveDataJson(tableData);
    console.log(`Data saved to ${savedFilePath}`);
  } catch (error) {
    console.error("Failed to fetch and process the data:", error);
  }
})();
