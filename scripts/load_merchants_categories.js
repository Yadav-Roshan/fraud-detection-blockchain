/**
 * This script loads the merchant, category, and job lists from the Python files
 * and generates JavaScript code to populate the frontend dropdown menus
 */
const fs = require('fs');
const path = require('path');

// Function to parse Python list files
function parsePythonList(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Extract the list part
        const listMatch = content.match(/\[([\s\S]*)\]/);
        if (!listMatch) return [];
        
        // Parse the list items
        const items = listMatch[1]
            .split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0)
            .map(item => {
                // Remove quotes
                return item.replace(/^['"]|['"]$/g, '');
            });
        
        return items;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return [];
    }
}

// Path to Python files
const apiDir = path.join(__dirname, '..', 'api');
const merchantsFile = path.join(apiDir, 'MERCHANTS.py');
const categoriesFile = path.join(apiDir, 'CATEGORIES.py');
const jobsFile = path.join(apiDir, 'JOBS.py');

// Output file
const outputDir = path.join(__dirname, '..', 'frontend', 'data');
fs.mkdirSync(outputDir, { recursive: true });
const outputFile = path.join(outputDir, 'data.js');

// Parse the files
const merchants = parsePythonList(merchantsFile);
const categories = parsePythonList(categoriesFile);
const jobs = parsePythonList(jobsFile);

// Generate JavaScript code
const jsCode = `// Auto-generated from Python lists
// Do not edit manually - use the load_merchants_categories.js script instead

// Merchants list
const MERCHANTS = ${JSON.stringify(merchants, null, 2)};

// Categories list
const CATEGORIES = ${JSON.stringify(categories, null, 2)};

// Jobs list
const JOBS = ${JSON.stringify(jobs, null, 2)};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MERCHANTS,
        CATEGORIES,
        JOBS
    };
}
`;

// Write to file
fs.writeFileSync(outputFile, jsCode);
console.log(`Data written to ${outputFile}`);

// Generate HTML for merchant dropdown
const merchantOptions = merchants
    .map(merchant => `<option value="${merchant}">${merchant.replace('fraud_', '')}</option>`)
    .join('\n');

// Generate HTML for category dropdown
const categoryOptions = categories
    .map(category => `<option value="${category}">${category}</option>`)
    .join('\n');

// Generate HTML for job dropdown
const jobOptions = jobs
    .map(job => `<option value="${job}">${job}</option>`)
    .join('\n');

console.log('\nMerchant Options HTML:');
console.log(merchantOptions);

console.log('\nCategory Options HTML:');
console.log(categoryOptions);

console.log('\nJob Options HTML:');
console.log(jobOptions);
