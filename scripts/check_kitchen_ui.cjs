const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || path.resolve(__dirname, '../app/node_modules/playwright'));
const root = process.env.KITCHAIN_WEB_EXPORT || path.resolve(__dirname, '../app/dist');
const out = process.env.ART_PREVIEW_DIR || path.join(require('node:os').tmpdir(), 'kitchain-ui-check');
fs.mkdirSync(out, { recursive: true });
assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Export the web app first (see docs/KITCHEN_DESIGN.md)');
// Uses synthetic API replies and a synthetic card; never starts Ollama or touches a real database.
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.join(root, pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
 await new Promise(resolve => server.listen(8027, '127.0.0.1', resolve));
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
 const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
 page.setDefaultTimeout(10000);
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 let recipes = [{ id: 501, title: 'Sunday tomato soup', description: 'A family favorite for chilly evenings.', ingredients: ['4 ripe tomatoes', '1 onion', '2 cups vegetable stock'], steps: ['Soften the onion.', 'Add tomatoes and stock. Simmer for 20 minutes.', 'Note: Serve with warm bread.'], image_path: null }];
 let creates = 0, deletes = 0, scans = 0, holdScan, releaseScan;
 await page.route('**/api/v1/**', async route => {
   const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
   const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
   const json = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
   if (method === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
   if (p === '/api/v1/handwriting-profiles/') return json([{ id: 12, name: 'Louise' }, { id: 13, name: 'Printed' }]);
   if (p === '/api/v1/recipes/scan') {
     scans++;
     if (holdScan) await new Promise(resolve => releaseScan = resolve);
     return json({ scan_id: 10, title: 'Sunday tomato soup', ingredients: ['4 tomatoes', '1 onion'], steps: ['Simmer gently.'], notes: ['Serve warm.'], raw_text: 'Synthetic AI reply', confidence: 'medium', uncertain_lines: [] });
   }
   if (p === '/api/v1/scans/10/correction') return json({ id: 10 });
   if (p === '/api/v1/recipes/' && method === 'POST') { creates++; const recipe = { id: 501 + creates, image_path: null, ...req.postDataJSON() }; recipes.push(recipe); return json(recipe); }
   if (/\/recipes\/\d+$/.test(p)) {
     const id = Number(p.split('/').pop()); const recipe = recipes.find(r => r.id === id);
     if (method === 'DELETE') { deletes++; recipes = recipes.filter(r => r.id !== id); return json({ ok: true }); }
     if (method === 'PATCH') { Object.assign(recipe, req.postDataJSON()); return json(recipe); }
     return json(recipe || { detail: 'Not found' }, recipe ? 200 : 404);
   }
   if (p === '/api/v1/recipes/') return json(recipes);
   return json({ status: 'ok' });
 });
 async function shot(name) { await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); }
 async function noOverflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontal overflow'); }
 try {
   await page.goto('http://127.0.0.1:8027/');
   await page.getByText('Welcome to your kitchen', { exact: true }).waitFor();
   await noOverflow(); await shot('home');
   await page.getByRole('link', { name: 'Your recipe collection', exact: true }).click();
   await page.getByRole('button', { name: 'Open recipe: Sunday tomato soup', exact: true }).waitFor();
   await noOverflow(); await shot('collection');
   await page.getByRole('textbox', { name: 'Search recipes' }).fill('nothing-like-this');
   await page.getByText('No matching recipes. Try another name or ingredient.', { exact: true }).waitFor();
   await page.getByRole('button', { name: 'Clear search' }).click();
   await page.getByRole('button', { name: 'Open recipe: Sunday tomato soup', exact: true }).click();
   await page.getByRole('heading', { name: 'Ingredients', exact: true }).waitFor();
   await noOverflow(); await shot('recipe');
   await page.getByRole('button', { name: 'Delete', exact: true }).click();
   await page.getByText('Delete recipe?', { exact: true }).waitFor();
   await shot('confirmation');
   await page.getByRole('button', { name: 'Cancel', exact: true }).click();
   assert.equal(deletes, 0);
   await page.getByRole('button', { name: 'Edit recipe', exact: true }).click();
   await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Unsaved title');
   await page.getByRole('button', { name: 'Cancel', exact: true }).click();
   await page.getByRole('heading', { name: 'Sunday tomato soup', exact: true }).waitFor();
   await page.goto('http://127.0.0.1:8027/AddRecipe');
   await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
   await page.getByText('Title required', { exact: true }).waitFor();
   await page.getByRole('button', { name: 'Done', exact: true }).click();
   await page.getByRole('textbox', { name: 'Recipe title', exact: true }).fill('New family recipe');
   await page.getByRole('textbox', { name: 'Ingredients · one per line', exact: true }).fill('2 eggs');
   await page.getByRole('textbox', { name: 'Directions · one step per line', exact: true }).fill('Mix gently.');
   await noOverflow(); await shot('manual');
   await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
   await page.getByText('Recipe created.', { exact: true }).waitFor();
   await page.getByRole('button', { name: 'Done', exact: true }).click();
   assert.equal(creates, 1);
   await page.goto('http://127.0.0.1:8027/AddFromPhoto');
   await page.getByRole('radio', { name: 'Printed', exact: true }).waitFor();
   await noOverflow(); await shot('scanner-empty');
   const chooser = page.waitForEvent('filechooser');
   await page.getByRole('button', { name: 'Choose a photo', exact: true }).click();
   await (await chooser).setFiles(path.resolve(__dirname, '../tests/fixtures/recipe.png'));
   await page.getByLabel('Selected recipe photo', { exact: true }).waitFor();
   await page.getByRole('radio', { name: 'Printed', exact: true }).click();
   holdScan = true;
   await page.getByRole('button', { name: 'Scan with AI', exact: true }).click();
   await page.getByText('Reading recipe…', { exact: true }).waitFor();
   await shot('scanning');
   while (!releaseScan) await new Promise(r => setTimeout(r, 20));
   releaseScan(); holdScan = false;
   await page.getByText('Review your recipe', { exact: true }).waitFor();
   await noOverflow(); await shot('review');
   await page.getByRole('button', { name: 'Scan again', exact: true }).click();
   await page.getByText('Scan this photo again?', { exact: true }).waitFor();
   await page.getByRole('button', { name: 'Keep review', exact: true }).click();
   assert.equal(scans, 1);
   await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
   await page.getByText('Your recipe and original photo were saved.', { exact: true }).waitFor();
   await shot('saved');
   await page.getByRole('button', { name: 'Done', exact: true }).click();
   await page.getByRole('button', { name: 'Edit recipe', exact: true }).waitFor();
   assert.equal(creates, 2);
   await page.getByRole('button', { name: 'Delete', exact: true }).click();
   await page.getByText('Delete recipe?', { exact: true }).waitFor();
   await page.getByRole('button', { name: 'Delete', exact: true }).click();
   await page.getByText('Recipe removed.', { exact: true }).waitFor();
   await page.getByRole('button', { name: 'Done', exact: true }).click();
   assert.equal(deletes, 1);
   for (const width of [320, 768, 1280]) {
     await page.setViewportSize({ width, height: 900 });
     await page.goto('http://127.0.0.1:8027/');
     await page.getByText('Welcome to your kitchen', { exact: true }).waitFor();
     await noOverflow(); await shot(`home-${width}`);
     await page.getByRole('link', { name: 'Scan with AI', exact: true }).click();
     await page.getByRole('radio', { name: 'Printed', exact: true }).waitFor();
     await noOverflow();
   }
   assert.deepEqual(errors, []);
   console.log('PASS home navigation, recipe search/clear/detail/edit Cancel, themed delete Cancel/confirm, manual validation/save, writer selection, photo selection/upload, scan waiting/review/rescan Cancel/save dialog, 320/390/768/1280 layouts, no browser exceptions. Synthetic API replies; not a native phone test.');
 } finally { releaseScan?.(); await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
