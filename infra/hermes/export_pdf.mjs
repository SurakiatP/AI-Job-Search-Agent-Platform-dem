// Use the native Career Ops exporter with the distro-tracked browser.
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { renderHtmlToPdf } from '/opt/career-ops/generate-pdf.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4) process.exit(2);
try {
  await renderHtmlToPdf(await readFile(input, 'utf8'), output, {
    inputPath: input,
    workspaceRoot: '/workspace',
    baseDir: dirname(output),
    launchBrowser: options => chromium.launch({ ...options, executablePath: '/usr/bin/chromium' }),
  });
} catch {
  process.stderr.write('export_failed\n');
  process.exit(1);
}
