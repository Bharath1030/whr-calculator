import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

console.log('Parsing water offtake financial data...\n');

// Parse Uravu spreadsheet
try {
  console.log('=== URAVU AWH ===');
  const uravuPath = path.join(process.cwd(), 'data', 'Microsoft_Uravu_Performance_and_Buisness_model_calculator.xlsx');
  const uravuWorkbook = XLSX.readFile(uravuPath);
  
  console.log('Available sheets:', uravuWorkbook.SheetNames.join(', '));
  
  // Look for financial data in each sheet
  uravuWorkbook.SheetNames.forEach(sheetName => {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const sheet = uravuWorkbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    // Search for CapEx, OpEx, Cost keywords
    data.forEach((row, idx) => {
      const rowStr = row.join('|').toLowerCase();
      if (rowStr.match(/capex|capital.*cost|investment/i) && row.some(cell => typeof cell === 'number' && cell > 1000)) {
        console.log(`  Row ${idx + 1}:`, row.slice(0, 5));
      }
      if (rowStr.match(/opex|operating.*cost|annual.*cost/i) && row.some(cell => typeof cell === 'number')) {
        console.log(`  Row ${idx + 1}:`, row.slice(0, 5));
      }
      if (rowStr.match(/lcow|levelized.*cost.*water/i)) {
        console.log(`  Row ${idx + 1}:`, row.slice(0, 5));
      }
    });
  });
} catch (err) {
  console.error('Error parsing Uravu:', err.message);
}

// Parse LCOW (Levelized Cost of Water) spreadsheet
try {
  console.log('\n\n=== LCOW (Trevi/FO) ===');
  const lcowPath = path.join(process.cwd(), 'data', 'LCOW Case 3_Submitted_06162025.xlsx');
  const lcowWorkbook = XLSX.readFile(lcowPath);
  
  console.log('Available sheets:', lcowWorkbook.SheetNames.join(', '));
  
  lcowWorkbook.SheetNames.forEach(sheetName => {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const sheet = lcowWorkbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    data.forEach((row, idx) => {
      const rowStr = row.join('|').toLowerCase();
      if (rowStr.match(/capex|capital.*cost|investment/i) && row.some(cell => typeof cell === 'number' && cell > 1000)) {
        console.log(`  Row ${idx + 1}:`, row.slice(0, 5));
      }
      if (rowStr.match(/opex|operating.*cost|annual.*cost/i) && row.some(cell => typeof cell === 'number')) {
        console.log(`  Row ${idx + 1}:`, row.slice(0, 5));
      }
      if (rowStr.match(/lcow|levelized/i) && row.some(cell => typeof cell === 'number')) {
        console.log(`  Row ${idx + 1}:`, row.slice(0, 5));
      }
    });
  });
} catch (err) {
  console.error('Error parsing LCOW:', err.message);
}

console.log('\n\nDone! Review the output above to identify relevant financial cells.');
