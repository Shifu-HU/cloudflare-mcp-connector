/**
 * Host half: install the Cloudflare token-permission skill.
 *
 * Skills are not npm packages — the harness discovers them as
 * `<skillsRoot>/<name>/SKILL.md` on disk. A plugin therefore has to place the
 * file there itself. This one writes it idempotently, records a checksum so an
 * update is only written when the content actually changed, and never touches
 * a file it did not create.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SKILL_NAME = 'cloudflare-token-permission';
const MARKER = '<!-- installed-by: dsh-cf-mcp -->';

/** Resolve the skill source shipped next to this module. */
function sourcePath() {
  return fileURLToPath(new URL('../skill/SKILL.md', import.meta.url));
}

/** Candidate skills roots, in priority order. */
function roots() {
  const list = [];
  const profile = process.env.DSH_PROFILE_DIR;
  if (profile) list.push(join(profile, 'skills'));
  list.push(join(homedir(), '.dsh', 'skills'));
  return list;
}

function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Install the skill into one root.
 * @returns 'installed' | 'updated' | 'unchanged' | 'skipped-foreign'
 */
function installInto(root, body) {
  const dir = join(root, SKILL_NAME);
  const file = join(dir, 'SKILL.md');

  if (existsSync(file)) {
    const current = readFileSync(file, 'utf8');
    // never clobber a file we did not write
    if (!current.includes(MARKER)) return 'skipped-foreign';
    if (digest(current) === digest(body)) return 'unchanged';
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, body, 'utf8');
    return 'updated';
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, body, 'utf8');
  return 'installed';
}

export function apply(ctx) {
  ctx.effect(() => {
    let body;
    try {
      body = readFileSync(sourcePath(), 'utf8');
    } catch (e) {
      ctx.logger?.warn?.(`[cloudflare-skill] skill source missing: ${e?.message || e}`);
      return;
    }

    // stamp provenance so a later update can tell its own file from a user's
    if (!body.includes(MARKER)) body = MARKER + '\n' + body;

    for (const root of roots()) {
      try {
        const r = installInto(root, body);
        if (r === 'installed') ctx.logger?.info?.(`[cloudflare-skill] installed into ${root}`);
        else if (r === 'updated') ctx.logger?.info?.(`[cloudflare-skill] updated in ${root}`);
        else if (r === 'skipped-foreign') {
          ctx.logger?.warn?.(
            `[cloudflare-skill] ${join(root, SKILL_NAME)} exists and was not written by this plugin; left untouched`,
          );
        }
        // 'unchanged' is the normal steady state: stay quiet
      } catch (e) {
        ctx.logger?.error?.(`[cloudflare-skill] could not write to ${root}: ${e?.message || e}`);
      }
    }
  }, 'cloudflare-skill: install SKILL.md');
}
