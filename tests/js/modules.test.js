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

test('every module except the entry point loads without a browser', async () => {
  for (const file of files.filter(f => f !== 'main.js')) {
    await import(new URL(file, dir));
  }
});
