// Check if there's a mismatch between parsed items and what gets sent via category toggle
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'meni.html'), 'utf-8');

// Check for items that are in pizze section but DON'T have data-sizes
// These are the "special" items
const pizzeRegex = /<section class="cat" id="pizze">([\s\S]*?)<\/section>/;
const pizzeMatch = html.match(pizzeRegex);
if (pizzeMatch) {
  const body = pizzeMatch[1];
  // Find ALL item divs
  const itemDivRegex = /<div class="item[^"]*"[^>]*data-name="([^"]+)"[^>]*>/g;
  let m;
  const standardPizze = [];
  const specialPizze = [];
  while ((m = itemDivRegex.exec(body)) !== null) {
    const fullMatch = m[0];
    const name = m[1];
    const hasSizes = fullMatch.includes('data-sizes');
    const isSpecial = fullMatch.includes('item--special');
    if (hasSizes) {
      standardPizze.push(name);
    } else {
      specialPizze.push(name);
    }
  }
  console.log('Standard pizze (with sizes):', standardPizze.length);
  standardPizze.forEach(n => console.log('  ', n));
  console.log('\nSpecial pizze (no sizes):', specialPizze.length);
  specialPizze.forEach(n => console.log('  ', n));
}

// Now simulate what the dashboard does
// It sends the names array from menuItems
// The server receives those names and sets menuAvailability[name] = false
// The client then checks availabilityMap[itemEl.dataset.name] !== false
console.log('\nAll items have matching data-name -> should work if menuItems is populated correctly');

// But check: does loadFromSupabase replace menuItems?
// In server.js line 242: if (Array.isArray(dbMenu) && dbMenu.length > 0) { menuItems.length = 0; ... }
// So if Supabase has stale data (e.g. missing special pizzas), those won't be in menuItems
console.log('\nPotential issue: If Supabase menu_items table is stale or missing items,');
console.log('loadFromSupabase() will replace the parsed menuItems with incomplete data.');
console.log('This could cause "Isključi sve" to only toggle items that exist in Supabase.');
