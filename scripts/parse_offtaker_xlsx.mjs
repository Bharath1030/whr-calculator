import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const input = path.join(__dirname, '..', 'data', 'Offtaker system and piping 25081014b.xlsx');
const out = path.join(__dirname, '..', 'data', 'offtaker_costs.json');

// Find the Heat Reuse DC file (handle versioned names like "Heat Reuse-DC-1MW (002).xlsx")
const dataDir = path.join(__dirname, '..', 'data');
const dcFiles = fs.readdirSync(dataDir).filter(f => f.includes('Heat Reuse') && f.includes('DC'));
const dcInput = dcFiles.length > 0 ? path.join(dataDir, dcFiles[0]) : path.join(dataDir, 'Heat Reuse-DC-1MW.xlsx');
const dcOut = path.join(__dirname, '..', 'data', 'dc_cooling_config.json');

if (!fs.existsSync(input)) {
  console.error('Input file not found:', input);
  process.exit(1);
}

const wb = xlsx.readFile(input);
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { defval: null });

// Basic heuristic: look for rows with a 'Parameter' and 'Value' columns
const result = { raw_rows: data };

// Try to pull common fields if present
for (const row of data) {
  if (row.Parameter && row.Value !== undefined) {
    result[row.Parameter] = row.Value;
  }
  if (row['Cost per km'] !== undefined) {
    result.cost_per_km = row['Cost per km'];
  }
}

fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log('Wrote', out);

// Parse DC cooling config
if (fs.existsSync(dcInput)) {
  try {
    const dcWb = xlsx.readFile(dcInput);
    const dcSheetName = dcWb.SheetNames[0];
    const dcSheet = dcWb.Sheets[dcSheetName];
    const dcData = xlsx.utils.sheet_to_json(dcSheet, { defval: null });
    fs.writeFileSync(dcOut, JSON.stringify(dcData, null, 2));
    console.log('Wrote', dcOut);
  } catch (err) {
    console.error('Error parsing DC cooling config:', err.message);
  }
} else {
  console.warn('DC input file not found:', dcInput);
}
