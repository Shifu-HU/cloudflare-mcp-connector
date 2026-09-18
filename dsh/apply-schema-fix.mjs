#!/usr/bin/env node
/**
 * apply-schema-fix.mjs — 让 dsh-mcp-client 能注册 Cloudflare 的 MCP 工具。
 *
 * 背景（实测复现）：
 *   Cloudflare MCP 返回的 tool inputSchema 带 "$schema" 关键字，
 *   而 dsh 的 assertSupportedJsonSchema 只接受
 *   type/oneOf/properties/required/additionalProperties/items/enum/const + 注解。
 *   插件把 inputSchema 原样交给 ctx.tools.register，于是抛 JsonSchemaError；
 *   该异常被 registrationFailure:"contain" 静默吞掉 →
 *   连接成功但 0 个工具注册，表现为“MCP 不可用”。
 *
 * 本脚本给插件打补丁：注册前递归剥离不受支持的 schema 关键字。
 * 幂等：已打过则跳过。先备份为 index.js.bak-schema-fix。
 *
 * 用法：
 *   node apply-schema-fix.mjs [dsh-mcp-client的lib目录]
 *   默认自动探测 ~/.dsh/profiles/<profile>/node_modules/@deepseek-ai/dsh-mcp-client/lib
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
	"$schema", "$id", "$ref", "$defs", "definitions", "allOf", "anyOf", "not",
	"if", "then", "else", "patternProperties", "propertyNames", "dependentSchemas",
	"dependentRequired", "unevaluatedProperties", "unevaluatedItems", "prefixItems",
	"contains", "minContains", "maxContains", "format", "pattern", "minimum",
	"maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength",
	"maxLength", "minItems", "maxItems", "uniqueItems", "minProperties",
	"maxProperties", "contentEncoding", "contentMediaType", "contentSchema"
]);
function sanitizeSchema(node) {
	if (Array.isArray(node)) return node.map(sanitizeSchema);
	if (node === null || typeof node !== "object") return node;
	const out = {};
	for (const [key, value] of Object.entries(node)) {
		if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
		if (key === "properties" && value !== null && typeof value === "object" && !Array.isArray(value)) {
			const properties = {};
			for (const [propertyName, propertySchema] of Object.entries(value)) properties[propertyName] = sanitizeSchema(propertySchema);
			out[key] = properties;
			continue;
		}
		if ((key === "items" || key === "additionalProperties" || key === "oneOf") && value !== null && typeof value === "object") {
			out[key] = sanitizeSchema(value);
			continue;
		}
		out[key] = value;
	}
	return out;
}
`;

const SYNC_ANCHOR = `/**
* Sync the MCP server's tool list into the harness ToolRegistry.`;
const PARAM_FROM = 'parameters: tool.inputSchema,';
const PARAM_TO = 'parameters: sanitizeSchema(tool.inputSchema),';

function findLibDirs() {
  const out = [];
  const profiles = join(homedir(), '.dsh', 'profiles');
  if (!existsSync(profiles)) return out;
  for (const profile of readdirSync(profiles)) {
    const lib = join(profiles, profile, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib');
    if (existsSync(join(lib, 'index.js'))) out.push(lib);
  }
  return out;
}

function patch(lib) {
  const file = join(lib, 'index.js');
  const source = readFileSync(file, 'utf8');

  if (source.includes(MARKER)) {
    console.log('SKIP  already patched: ' + file);
    return true;
  }
  if (!source.includes(SYNC_ANCHOR) || !source.includes(PARAM_FROM)) {
    console.error('FAIL  anchors not found (plugin version changed?): ' + file);
    return false;
  }

  copyFileSync(file, file + '.bak-schema-fix');

  let next = source.replace(SYNC_ANCHOR, SANITIZER + SYNC_ANCHOR);
  next = next.replace(PARAM_FROM, PARAM_TO);

  if (!next.includes(PARAM_TO) || !next.includes(MARKER)) {
    console.error('FAIL  replacement did not apply cleanly: ' + file);
    return false;
  }

  writeFileSync(file, next);
  console.log('OK    patched: ' + file);
  console.log('      backup : ' + file + '.bak-schema-fix');
  return true;
}

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : findLibDirs();

if (targets.length === 0) {
  console.error('FAIL  no dsh-mcp-client install found. Pass its lib directory explicitly:');
  console.error('      node apply-schema-fix.mjs <.../dsh-mcp-client/lib>');
  process.exit(1);
}

const ok = targets.map(patch).every(Boolean);
console.log(ok ? '\nDone. Restart dsh to take effect.' : '\nSome targets failed.');
process.exit(ok ? 0 : 1);
