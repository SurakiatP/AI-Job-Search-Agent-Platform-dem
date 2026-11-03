// Every th locale file has exactly the keys of its en twin, so no string falls back to the other language.
// Plural suffixes are folded: Thai has one plural form (`_other`), English has `_one` and `_other`.
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '../../frontend/src/locales');
const keys = (value: unknown, prefix = ''): string[] => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
  : [prefix.replace(/_(zero|one|two|few|many|other)$/, '')];

for (const en of readdirSync(dir).filter(name => name.endsWith('.en.json'))) {
  test(`locale keys match: ${en.replace('.en.json', '')}`, () => {
    const load = (name: string) => new Set(keys(JSON.parse(readFileSync(join(dir, name), 'utf8'))));
    const a = load(en), b = load(en.replace('.en.json', '.th.json'));
    expect([...a].filter(k => !b.has(k)), 'missing in th').toEqual([]);
    expect([...b].filter(k => !a.has(k)), 'missing in en').toEqual([]);
  });
}
