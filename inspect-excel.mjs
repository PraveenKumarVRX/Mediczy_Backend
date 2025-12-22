import XLSX from 'xlsx';
import { readFileSync } from 'fs';

const files = [
  {
    path: 'server/db/Master Data/Hospitals Data/Hospital list.xlsx',
    name: 'Hospital List'
  },
  {
    path: 'server/db/Master Data/Hospitals Data/SmartHealth Hospital master list.xlsx',
    name: 'SmartHealth Hospital Master'
  },
  {
    path: 'server/db/Master Data/Labs/labs list.xlsx',
    name: 'Labs List'
  }
];

files.forEach(({ path, name }) => {
  console.log('\n' + '='.repeat(70));
  console.log(`${name.toUpperCase()}`);
  console.log('='.repeat(70));
  
  try {
    const workbook = XLSX.readFile(path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📄 File: ${path}`);
    console.log(`📋 Sheet: ${sheetName}`);
    console.log(`📊 Total Rows: ${data.length}`);
    
    if (data.length > 0) {
      const columns = Object.keys(data[0]);
      console.log(`\n📌 Columns (${columns.length}):`);
      columns.forEach((col, i) => console.log(`   ${i + 1}. ${col}`));
      
      console.log(`\n📝 Sample Data (first 2 rows):`);
      console.log(JSON.stringify(data.slice(0, 2), null, 2));
    }
  } catch (error) {
    console.error(`❌ Error reading ${path}:`, error.message);
  }
});
