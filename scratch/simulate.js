const fs = require('fs');
const path = require('path');

// Mock a browser environment
const html = fs.readFileSync(path.join(__dirname, '..', 'meni.html'), 'utf-8');
const js = fs.readFileSync(path.join(__dirname, '..', 'meni.js'), 'utf-8');

// Extract itemTranslations and ingredientTranslations from meni.js
const itemTranslationsMatch = js.match(/const itemTranslations = {([\s\S]*?)};/);
const ingredientTranslationsMatch = js.match(/const ingredientTranslations = {([\s\S]*?)};/);

const itemTranslations = eval(`({${itemTranslationsMatch[1]}})`);
const ingredientTranslations = eval(`({${ingredientTranslationsMatch[1]}})`);

console.log('Hawaii translation in map:', itemTranslations['Hawaii']);

// Let's parse all items in HTML
const itemRegex = /<div class="item([^"]*)"([^>]*)>([\s\S]*?)<\/div>\s*<\/div>/g;
let m;
let count = 0;
while ((m = itemRegex.exec(html)) !== null) {
  const classes = m[1];
  const attrs = m[2];
  const inner = m[3];
  
  const nameMatch = attrs.match(/data-name="([^"]+)"/);
  const baseName = nameMatch ? nameMatch[1] : undefined;
  
  // Find name span
  const nameSpanMatch = inner.match(/<span class="item__name">([\s\S]*?)<\/span>/);
  if (!nameSpanMatch) continue;
  
  const nameSpanContent = nameSpanMatch[1];
  
  // Child node 0 is the text before any nested span
  const textNode = nameSpanContent.split('<')[0].trim();
  
  console.log(`Item #${++count}: baseName="${baseName}", textNode="${textNode}"`);
  
  if (baseName === undefined) {
    console.log(`  --> Warning: baseName is undefined for this item!`);
  }
}
