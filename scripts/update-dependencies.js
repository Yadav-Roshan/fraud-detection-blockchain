/**
 * This script helps identify and update deprecated dependencies
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking for outdated packages...');
try {
  const outdated = execSync('npm outdated --json').toString();
  const outdatedPackages = JSON.parse(outdated);
  
  console.log('📦 Outdated packages found:');
  console.table(outdatedPackages);
  
  console.log('\n🔄 Updating packages...');
  
  // Update all dependencies to latest compatible versions
  execSync('npm update', { stdio: 'inherit' });
  
  console.log('\n✅ Dependencies updated!');
  console.log('\nℹ️ Note: Some packages may still show deprecation warnings if they\'re transitive dependencies.');
  console.log('   Consider using "npm ls <package-name>" to identify which packages depend on deprecated ones.');
  console.log('   You may need to switch to alternative packages in some cases.');
} catch (error) {
  if (error.status === 1) {
    console.log('✅ All packages are up to date!');
  } else {
    console.error('❌ Error checking dependencies:', error.message);
  }
}
