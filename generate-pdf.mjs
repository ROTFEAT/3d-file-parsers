import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(`file://${join(__dirname, 'issuu-whitepaper.html')}`, {
  waitUntil: 'networkidle',
});

// Wait for fonts to load
await page.waitForTimeout(2000);

await page.pdf({
  path: join(__dirname, '3d-file-parsers-guide.pdf'),
  format: 'A4',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  preferCSSPageSize: false,
});

await browser.close();
console.log('PDF generated: 3d-file-parsers-guide.pdf');
