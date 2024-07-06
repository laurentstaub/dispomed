import * as fs from "fs/promises";
import * as path from "path";

// Function to convert date from "30 nov. 2023" to "2023-12-01"
function convertDateFormat(dateStr) {
    const months = {
        'janv.': '01', 'févr.': '02', 'mars': '03', 'avr.': '04', 'mai': '05', 'juin': '06',
        'juil.': '07', 'août': '08', 'sept.': '09', 'oct.': '10', 'nov.': '11', 'déc.': '12'
    };
    const [day, month, year] = dateStr.split(' ');
    return `${year}-${months[month]}-${day.padStart(2, '0')}`;
}

// Directories for input and output JSON files
const inputDirectory = './old_data';
const outputDirectory = './new_data';

// Ensure the output directory exists
await fs.mkdir(outputDirectory, { recursive: true });

// Read all files in the input directory
const files = await fs.readdir(inputDirectory);

// Filter JSON files
const jsonFiles = files.filter(file => path.extname(file) === '.json');

for (const file of jsonFiles) {
    const filePath = path.join(inputDirectory, file);

    // Read each JSON file
    const data = await fs.readFile(filePath, 'utf8');

    // Parse JSON data
    let jsonData;
    try {
        jsonData = JSON.parse(data);
    } catch (err) {
        console.error('Error parsing JSON:', err);
        continue;
    }

    // Iterate over each object in the JSON data
    jsonData.forEach(item => {
        if (item["Remise à disposition"]) {
            item["Remise à disposition"] = convertDateFormat(item["Remise à disposition"]);
        }
    });

    // Write the updated JSON data to the output directory
    const outputFilePath = path.join(outputDirectory, file);
    await fs.writeFile(outputFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
    console.log(`Successfully updated file: ${file}`);
}
