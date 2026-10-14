// Every browser module must load, and every name it imports must actually be exported.
// Catches broken imports after refactors without needing a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../docs/js/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.js'));

test('every named import resolves to an export', async () => {
  for (const file of files) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    for (const [, names, from] of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([^']+)'/g)) {
      const mod = await import(new URL(from, dir));
      for (const name of names.split(',').map(n => n.trim()).filter(Boolean)) {
        assert.ok(name in mod, `${file} imports "${name}" but ${from} does not export it`);
      }
    }
  }
});

// Entry points of the app pages (they start drawing the page as soon as they load).
const PAGES = { 'index.html': 'home.js', 'events.html': 'main.js', 'inventory.html': 'inventoryPage.js' };

test('every module except the page entry points loads without a browser', async () => {
  for (const file of files.filter(f => !Object.values(PAGES).includes(f))) {
    await import(new URL(file, dir));
  }
});

for (const [page, entry] of Object.entries(PAGES)) {
  test(`${page} stamps one release version on every module (run tools/stamp_release.py)`, () => {
    const html = readFileSync(new URL(`../../docs/${page}`, import.meta.url), 'utf8');
    const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
    const version = new RegExp(`js/${entry.replace('.', '\\.')}\\?v=([\\w.-]+)`).exec(html)[1];
    for (const file of files) {
      assert.equal(map[`./js/${file}`], `./js/${file}?v=${version}`, `${file} is missing from the import map or has an old version`);
    }
    assert.ok(html.includes(`styles.css?v=${version}`), 'stylesheet has the same version');
    assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'), 'import map comes before the module script');
  });
}
