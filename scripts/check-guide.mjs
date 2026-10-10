#!/usr/bin/env node
/**
 * Reminder for docs/wapee-product-guide.html (the founder's product guide).
 * Lists product files changed since the guide was last committed, so whoever changes a
 * feature, plan rule, add-on or flow remembers to update the guide in the same commit.
 * Read-only; always exits 0.
 */
import { execFileSync } from 'node:child_process';

const GUIDE = 'docs/wapee-product-guide.html';
const WATCHED = ['src/features', 'src/config', 'app', 'supabase/migrations', 'supabase/functions'];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const lastGuideCommit = git(['log', '-1', '--format=%h', '--', GUIDE]);
if (!lastGuideCommit) {
  console.log(`${GUIDE} is not committed yet.`);
  process.exit(0);
}
const lastGuideDate = git(['log', '-1', '--format=%ad', '--date=short', '--', GUIDE]);

const committed = git(['diff', '--name-only', `${lastGuideCommit}..HEAD`, '--', ...WATCHED]);
const working = git(['diff', '--name-only', 'HEAD', '--', ...WATCHED]);
const changed = [...new Set([...committed.split('\n'), ...working.split('\n')])].filter(Boolean);

console.log(`Product guide last updated in ${lastGuideCommit} (${lastGuideDate}).`);
if (changed.length === 0) {
  console.log('No product files changed since then.');
} else {
  console.log(
    `${changed.length} product file(s) changed since then. If any of them changes a feature,`,
  );
  console.log('plan rule, add-on, launch flag or workflow, update the guide in the same commit:');
  for (const file of changed) console.log(`  - ${file}`);
}
