import * as cheerio from "cheerio";
import * as fs from "fs";
import fetch from "node-fetch";

const generateFilename = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  const filename = `${year}-${month}-${day}-${hour}-${minute}-${second}.json`;
  return filename;
};

const saveDataJson = (products) => {
  const filename = generateFilename();
  const jsonDataString = JSON.stringify(products, null, 2);
  const folder = "data";
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
  fs.writeFileSync(`${folder}/${filename}`, jsonDataString);
  return `./data/${filename}`;
};

const convertFrenchDateToISO = (frenchDate) => {
  const months = {
    "janv.": "01",
    "févr.": "02",
    mars: "03",
    "avr.": "04",
    mai: "05",
    juin: "06",
    "juil.": "07",
    août: "08",
    "sept.": "09",
    "oct.": "10",
    "nov.": "11",
    "déc.": "12",
  };

  const parts = frenchDate.split(" ");
  const day = parts[0].padStart(2, "0");
  const month = months[parts[1]];
  const year = parts[2];

  if (frenchDate === "" || frenchDate === null) return "";
  return `${year}-${month}-${day}`;
};

async function fetchLinkedPage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const body = await response.text();
    const $ = cheerio.load(body);

    // Extract the h1 with class 'page-header-title'
    const pageTitle = $('h1.page-header-title').text().trim();
    // Extract information based on h3 and div.content
    const info = {};
    $('h3').each((i, element) => {
      const title = $(element).text().trim();
      const content = $(element).next('div.content').text().trim();
      info[title] = content;
    });

    return { pageTitle, info };
  } catch (error) {
    console.error(`Failed to fetch linked page ${url}:`, error);
    return { pageTitle : "", info : "" };
  }
}

export { generateFilename, saveDataJson, convertFrenchDateToISO, fetchLinkedPage };
