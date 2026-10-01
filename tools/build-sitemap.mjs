#!/usr/bin/env node
/**
 * Regenerate site/sitemap.xml from whatever is currently in site/reports/.
 * Runs on every Vercel deploy, so adding a model report is enough.
 *
 * Canonical host is servenomaster.com/ai-arena because that is the URL the public
 * reaches and the one that should be indexed. The *.vercel.app address is only an origin.
 */
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const BASE = process.env.ARENA_BASE_URL || 'https://servenomaster.com/ai-arena';

const iso = (p) => statSync(p).mtime.toISOString().slice(0, 10);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const urls = [{ loc: `${BASE}/`, lastmod: iso(join(SITE, 'index.html')), priority: '1.0' }];

const reports = readdirSync(join(SITE, 'reports'))
  .filter((f) => f.endsWith('.html'))
  .sort();

for (const f of reports) {
  urls.push({
    // vercel.json rewrites /reports/:slug -> /reports/:slug.html, so publish the clean URL
    loc: `${BASE}/reports/${f.slice(0, -5)}`,
    lastmod: iso(join(SITE, 'reports', f)),
    priority: '0.8',
  });
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.flatMap((u) => [
    '  <url>',
    `    <loc>${esc(u.loc)}</loc>`,
    `    <lastmod>${u.lastmod}</lastmod>`,
    `    <priority>${u.priority}</priority>`,
    '  </url>',
  ]),
  '</urlset>',
  '',
].join('\n');

writeFileSync(join(SITE, 'sitemap.xml'), xml);
console.log(`sitemap.xml: ${urls.length} URLs (${reports.length} reports + index) -> ${BASE}`);

// Guard: a canonical pointing at a 404 can get the page dropped from the index.
// This caught a real bug - every report canonical had a doubled /ai-arena/ai-arena/ path.
let bad = 0;
for (const f of reports) {
  const html = readFileSync(join(SITE, 'reports', f), 'utf8');
  const m = html.match(/<link rel="canonical" href="([^"]*)"/i);
  if (!m) { console.warn(`  WARN no canonical: ${f}`); bad++; continue; }
  const expected = `${BASE}/reports/${f.slice(0, -5)}`;
  if (m[1] !== expected) {
    console.warn(`  WARN canonical mismatch in ${f}\n       is: ${m[1]}\n       expected: ${expected}`);
    bad++;
  }
}
if (bad) {
  console.error(`\n${bad} report page(s) have a wrong or missing canonical.`);
  process.exit(1);
}
console.log(`all ${reports.length} report canonicals verified`);
