// Real disposable backend: run scripts/discovery_ui_fixture.py in another terminal.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = process.env.KITCHAIN_WEB_EXPORT || path.resolve(__dirname, '../app/dist');
const out = process.env.DISCOVERY_PREVIEW_DIR || path.join(require('node:os').tmpdir(), 'kitchain-discovery-preview');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.join(root, pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && /^\/\d+$/.test(pathname)) file = path.join(root, '[id].html');
  if (!fs.existsSync(file) && /^\/public\/\d+$/.test(pathname)) file = path.join(root, 'public/[id].html');
  if (!fs.existsSync(file)) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  const backend = spawn(process.env.KITCHAIN_TEST_PYTHON || 'python', [path.join(__dirname, 'discovery_ui_fixture.py')], { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let backendLog = '';
  backend.stdout.on('data', data => backendLog = (backendLog + data).slice(-8000));
  backend.stderr.on('data', data => backendLog = (backendLog + data).slice(-8000));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { const health = await fetch('http://127.0.0.1:8017/api/v1/health'); if (health.ok) { ready = true; break; } } catch {}
    if (backend.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) { backend.kill('SIGTERM'); throw new Error('Disposable API did not start: ' + backendLog); }
  await new Promise(resolve => server.listen(8028, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const origin = 'http://127.0.0.1:8028';
  async function shot(name) { await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true }); }
  async function noOverflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontal overflow'); }
  try {
    await page.goto(origin + '/discover');
    await page.getByRole('textbox', { name: 'What sounds good?', exact: true }).fill('rice');
    await page.getByRole('button', { name: 'Find three recipe ideas', exact: true }).click();
    await page.getByRole('heading', { name: "Grandma's rice", exact: true }).waitFor();
    await page.getByText('1000 shared web searches left this month.', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'What sounds good?', exact: true }).fill('chicken');
    await page.getByRole('textbox', { name: 'Ingredients I have · comma or line separated', exact: true }).fill('rice');
    await page.getByRole('button', { name: 'Find three recipe ideas', exact: true }).click();
    await page.getByRole('heading', { name: 'Published chicken and rice', exact: true }).waitFor();
    await page.getByText('999 shared web searches left this month.', { exact: true }).waitFor();
    await noOverflow(); await shot('recommendations');
    await page.getByRole('button', { name: 'Open recipe: Published chicken and rice', exact: true }).click();
    await page.getByRole('heading', { name: 'Published chicken and rice', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Read original recipe', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Keep a copy in my collection', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Save my rating', exact: true }).isDisabled(), true);
    await page.getByRole('checkbox', { name: 'I cooked this recipe', exact: true }).click();
    await page.getByRole('radio', { name: '5 stars', exact: true }).click();
    await page.getByRole('button', { name: 'Save my rating', exact: true }).click();
    await page.getByText('5 / 5 · 1 KitChain cook rating(s)', { exact: true }).waitFor();
    await page.getByRole('radio', { name: '3 stars', exact: true }).click();
    await page.getByRole('button', { name: 'Update my rating', exact: true }).click();
    await page.getByText('3 / 5 · 1 KitChain cook rating(s)', { exact: true }).waitFor();
    await noOverflow(); await shot('public-recipe-rating');

    await page.goto(origin + '/public');
    await page.getByRole('textbox', { name: 'Published recipe URL', exact: true }).fill('https://recipes.example/licensed');
    await page.getByRole('button', { name: 'Add recipe from link', exact: true }).click();
    await page.getByRole('heading', { name: 'Published rice bowl', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Directions', exact: true }).waitFor();
    await page.getByRole('button', { name: 'View recipe license', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Keep a copy in my collection', exact: true }).click();
    await page.getByText('Original recipe credit', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'View original recipe license', exact: true }).waitFor();

    await page.goto(origin + '/1');
    await page.getByRole('button', { name: 'Calculate nutrition', exact: true }).click();
    await page.getByText('1 ingredient(s) still need a food match or weight.', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Servings in this recipe', exact: true }).fill('3');
    await page.getByRole('button', { name: 'Review food matches and weights', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search food for ingredient 1', exact: true }).fill('rice white long grain regular enriched cooked');
    await page.getByRole('button', { name: 'Search USDA foods', exact: true }).click();
    await page.getByRole('button', { name: 'Use Rice, white, long-grain, regular, enriched, cooked', exact: true }).click();
    await page.getByRole('textbox', { name: 'Grams for ingredient 1', exact: true }).fill('150');
    await page.getByRole('button', { name: 'Save nutrition corrections', exact: true }).click();
    await page.getByText('Per serving · recipe makes 3', { exact: true }).waitFor();
    await page.getByText('65 kcal · 1.3 g protein', { exact: true }).waitFor();
    await noOverflow(); await shot('nutrition');
    await page.getByRole('button', { name: 'Share my own recipe publicly', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Share my own recipe publicly', exact: true }).click();
    await page.getByRole('button', { name: 'I own this recipe · share it', exact: true }).click();
    await page.getByRole('button', { name: 'Remove my public recipe', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Remove my public recipe', exact: true }).click();
    await page.getByRole('button', { name: 'Remove public copy', exact: true }).click();
    await page.getByRole('heading', { name: 'The public recipe table', exact: true }).waitFor();
    await page.getByRole('radio', { name: 'Highest rated', exact: true }).click();
    await page.getByRole('button', { name: 'Open Published chicken and rice', exact: true }).waitFor();
    await noOverflow(); await shot('public-collection');
    assert.equal(await page.getByRole('button', { name: "Open Grandma's rice", exact: true }).count(), 0);

    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/discover', '/public']) {
        await page.goto(origin + route);
        await page.getByRole('heading', { name: route === '/public' ? 'The public recipe table' : 'What should we cook?', exact: true }).waitFor();
        await noOverflow();
      }
    }
    await page.goto(origin + '/discover?mode=public');
    await page.getByRole('radio', { name: 'Public recipes only', checked: true, exact: true }).waitFor();
    await noOverflow();
    assert.deepEqual(errors, []);
    console.log('PASS real SQLite/USDA browser flows: saved match avoids search, missing match imports source, one-credit use, link-only vs full recipe, cooked/rating/update, permitted copy and credit, food/grams/serving corrections, share Cancel/confirm, unpublish, public sorting, 320/390/768/1280 layouts. External sites and Tavily simulated; text AI disabled.');
  } catch (error) {
    console.error('Browser failure at', page.url(), await page.getByRole('radio').evaluateAll(nodes => nodes.map(node => ({ text: node.innerText, checked: node.getAttribute('aria-checked'), selected: node.getAttribute('aria-selected') }))));
    await shot('failure');
    throw error;
  } finally { await browser.close(); server.close(); backend.kill('SIGTERM'); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
