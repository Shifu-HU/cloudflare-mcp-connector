/**
 * Host half: make Cloudflare's MCP tools registerable.
 *
 * Why this exists (measured, not guessed): every tool inputSchema Cloudflare
 * returns carries "$schema": "https://json-schema.org/draft/2020-12/schema".
 * dsh-mcp-client hands that schema to ctx.tools.register unchanged, and the
 * harness's assertSupportedJsonSchema rejects unknown keywords. The throw is
 * contained by `registrationFailure: "contain"`, so the connection reports
 * success while zero tools register — the worst kind of failure: silent.
 *
 * The fix is a small, targeted rewrite of the mcp-client's registration path:
 * strip unsupported keywords right before registration. It is idempotent and
 * backs the original file up before touching it.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const MARKER = 'UNSUPPORTED_SCHEMA_KEYWORDS';

const SANITIZER = `/**
* Strip JSON Schema keywords the harness subset rejects before registration.
*
* MCP servers routinely advertise draft-2020-12 schemas carrying \`$schema\`
* (Cloudflare's endpoint does), but \`assertSupportedJsonSchema\` accepts only
* type/oneOf/properties/required/additionalProperties/items/enum/const plus
* annotations. Passing the raw schema through made \`ctx.tools.register\`
* throw, and with \`registrationFailure: "contain"\` the whole server
* silently registered zero tools. Recursively keep only supported keywords.
*
* @param node - untrusted raw JSON Schema from the MCP server.
* @returns A structurally equivalent schema inside the supported subset.
*/
const UNSUPPORTED_SCHEMA_KEYWORDS = /* @__PURE__ */ new Set([
	"$schema", "$id", "$comment", "$defs", "definitions", "patternProperties",
	"propertyNames", "dependencies", "dependentSchemas", "dependentRequired",
	"if", "then", "else", "allOf", "anyOf", "not", "contains", "minContains",
	"maxContains", "prefixItems", "unevaluatedItems", "unevaluatedProperties",
	"minProperties", "maxProperties", "pattern", "format", "multipleOf",
	"exclusiveMinimum", "exclusiveMaximum", "contentEncoding", "contentMediaType",
	"contentSchema", "examples", "deprecated", "readOnly", "writeOnly"
]);
function sanitizeJsonSchema(node) {
	if (Array.isArray(node)) return node.map(sanitizeJsonSchema);
	if (node === null || typeof node !== "object") return node;
	const out = {};
	for (const [key, value] of Object.entries(node)) {
		if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
		if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
			const props = {};
			for (const [name, sub] of Object.entries(value)) props[name] = sanitizeJsonSchema(sub);
			out.properties = props;
			continue;
		}
		out[key] = sanitizeJsonSchema(value);
	}
	return out;
}
`;

/** Locate every installed dsh-mcp-client lib directory. */
export function findTargets(explicit) {
  if (explicit) return existsSync(explicit) ? [explicit] : [];
  const roots = [
    join(homedir(), '.dsh', 'profiles'),
    join(homedir(), '.dsh', 'node_modules', '@deepseek-ai'),
  ];
  const found = [];
  const pkg = '@deepseek-ai/dsh-mcp-client';

  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = join(dir, e.name);
      if (e.name === 'dsh-mcp-client') {
        const lib = join(p, 'lib');
        if (existsSync(join(lib, 'index.js'))) found.push(lib);
      }
      if (e.name === 'node_modules' || e.name === 'profiles' || depth < 2) walk(p, depth + 1);
    }
  };
  for (const r of roots) if (existsSync(r)) walk(r, 0);

  // direct resolution as a fallback
  if (found.length === 0) {
    try {
      const { createRequire } = require('node:module');
      const req = createRequire(join(homedir(), '.dsh', 'package.json'));
      const p = req.resolve(`${pkg}/package.json`);
      const lib = join(dirname(p), 'lib');
      if (existsSync(join(lib, 'index.js'))) found.push(lib);
    } catch {}
  }
  return [...new Set(found)];
}

/**
 * Apply the sanitizer to one lib directory.
 * @returns 'patched' | 'already' | 'missing'
 */
export function patchLib(lib) {
  const file = join(lib, 'index.js');
  if (!existsSync(file)) return 'missing';
  const src = readFileSync(file, 'utf8');
  if (src.includes(MARKER)) return 'already';

  // The registration call passes the raw schema; wrap it.
  const patterns = [
    /inputSchema\s*:\s*(tool\.[A-Za-z_$][\w$]*)/g,
    /inputSchema\s*:\s*([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)/g,
  ];
  let out = src;
  let hits = 0;
  for (const re of patterns) {
    out = out.replace(re, (m, expr) => {
      hits++;
      return `inputSchema: sanitizeJsonSchema(${expr})`;
    });
  }
  if (hits === 0) return 'missing';

  const idx = out.indexOf('const UNSUPPORTED_SCHEMA_KEYWORDS');
  if (idx < 0) {
    // insert the helper after the first import block
    const m = out.match(/^(?:import[^\n]*\n)+/m);
    const at = m ? m[0].length : 0;
    out = out.slice(0, at) + SANITIZER + out.slice(at);
  }
  copyFileSync(file, file + '.bak-schema-fix');
  writeFileSync(file, out, 'utf8');
  return 'patched';
}

/** Plugin entry: patch on load, report through the logger. */
export function apply(ctx) {
  ctx.effect(() => {
    const targets = findTargets();
    if (targets.length === 0) {
      ctx.logger?.warn?.('[cloudflare-mcp] dsh-mcp-client not found; schema patch skipped');
      return;
    }
    for (const lib of targets) {
      try {
        const r = patchLib(lib);
        if (r === 'patched') ctx.logger?.info?.(`[cloudflare-mcp] schema patch applied: ${lib}`);
        else if (r === 'already') ctx.logger?.info?.('[cloudflare-mcp] schema patch already present');
        else ctx.logger?.warn?.(`[cloudflare-mcp] could not locate registration call in ${lib}`);
      } catch (e) {
        ctx.logger?.error?.(`[cloudflare-mcp] schema patch failed: ${e?.message || e}`);
      }
    }
  }, 'cloudflare-mcp: schema sanitizer');
}
