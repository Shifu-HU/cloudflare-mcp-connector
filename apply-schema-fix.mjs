#!/usr/bin/env node
/**
 * CLI wrapper: apply the JSON-Schema sanitizer to every installed
 * dsh-mcp-client. The plugin applies it automatically on load; this script is
 * for when the plugin is disabled, or after upgrading dsh-mcp-client (which
 * overwrites the patched file).
 *
 * Usage:
 *   node apply-schema-fix.mjs [dsh-mcp-client lib dir]
 */
import { findTargets, patchLib } from './lib/index.js';

const explicit = process.argv[2];
const targets = findTargets(explicit);

if (targets.length === 0) {
  console.error('dsh-mcp-client not found. Pass its lib directory explicitly:');
  console.error('  node apply-schema-fix.mjs ~/.dsh/profiles/<profile>/node_modules/@deepseek-ai/dsh-mcp-client/lib');
  process.exit(1);
}

let changed = 0;
for (const lib of targets) {
  const r = patchLib(lib);
  if (r === 'patched') { changed++; console.log('patched  :', lib); }
  else if (r === 'already') console.log('already  :', lib);
  else { console.error('not found:', lib); }
}

console.log(changed ? `\n${changed} file(s) patched — restart the harness to apply.` : '\nnothing to do.');
process.exit(0);
