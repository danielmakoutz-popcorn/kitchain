// Part of check_discovery_ui.cjs; runs against its disposable real backend.
const path = require('node:path');
const assert = require('node:assert/strict');

module.exports = async function checkPantry({ page, browser, origin, noOverflow, shot }) {
  const name = 'Pantry ingredients · comma or line separated';
  const input = () => page.getByRole('textbox', { name, exact: true });
  async function expectValue(target, label, value) {
    await target.waitForFunction(({ label, value }) => {
      const element = [...document.querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === label);
      return element && !element.disabled && !element.readOnly && element.value === value;
    }, { label, value });
  }
  async function save(target = page) {
    await target.getByRole('button', { name: 'Save pantry', exact: true }).click();
    await target.getByText('Pantry saved for your cook profile.', { exact: true }).waitFor();
  }

  await page.goto(origin + '/pantry');
  await expectValue(page, name, 'rice');
  await input().fill('Ground beef\nRice'); await save();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose ingredient photo', exact: true }).click(),
  ]);
  await chooser.setFiles(path.resolve(__dirname, '../tests/fixtures/recipe.png'));
  await page.getByRole('button', { name: 'Read ingredient photo', exact: true }).click();
  const review = page.getByRole('textbox', { name: 'Review photo ingredients', exact: true });
  await review.fill('Rice\nBell pepper\nEggs');
  await page.getByRole('button', { name: 'Add reviewed ingredients', exact: true }).click();
  assert.equal(await input().inputValue(), 'Ground beef\nRice\nBell pepper\nEggs');
  await save(); await noOverflow(); await shot('pantry');
  await page.getByRole('link', { name: 'Find a meal with my pantry', exact: true }).click();
  const availableName = 'Ingredients I have · comma or line separated';
  await expectValue(page, availableName, 'Ground beef\nRice\nBell pepper\nEggs');
  await page.getByRole('textbox', { name: availableName, exact: true }).fill('Rice, jalapeño');
  await page.getByRole('textbox', { name: 'What sounds good?', exact: true }).fill('blocked');
  await page.getByRole('button', { name: 'Find three recipe ideas', exact: true }).click();
  await page.getByText('Recipe websites could not be imported', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open source website: Blocked published recipe', exact: true }).waitFor();
  await noOverflow(); await shot('blocked-source-guidance');
  await page.goto(origin + '/pantry');
  await expectValue(page, name, 'Rice\njalapeño');

  const stale = await page.context().newPage();
  await stale.goto(origin + '/pantry'); await expectValue(stale, name, 'Rice\njalapeño');
  await input().fill('Rice\nTomato'); await save();
  await stale.getByRole('textbox', { name, exact: true }).fill('Old unsaved change');
  await stale.getByRole('button', { name: 'Save pantry', exact: true }).click();
  await stale.getByText(/Your pantry changed elsewhere/).waitFor();
  assert.equal(await stale.getByRole('textbox', { name, exact: true }).inputValue(), 'Old unsaved change');
  await stale.getByRole('button', { name: 'Reload saved pantry', exact: true }).click();
  await stale.getByRole('button', { name: 'Reload pantry', exact: true }).click();
  await expectValue(stale, name, 'Rice\nTomato'); await stale.close();

  const other = await browser.newPage();
  await other.goto(origin + '/pantry'); await expectValue(other, name, ''); await other.close();

  await page.goto(origin + '/public');
  await page.getByRole('textbox', { name: 'Published recipe URL', exact: true }).fill('https://recipes.example/blocked');
  await page.getByRole('button', { name: 'Add recipe from link', exact: true }).click();
  await page.getByText('This recipe could not be imported', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open original website', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Write a family recipe manually', exact: true }).waitFor();
  console.log('PASS pantry: legacy migration, manual/photo review/save, duplicate merging, recommendation sync, stale edits/reload, separate cook profile, blocked-source links and manual fallback. Vision reply and source sites are synthetic.');
};
