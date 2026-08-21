/**
 * Loads a TypeScript module into a `.mjs` suite.
 *
 * The alternative was to reimplement the CSV parser in the test, which would
 * have proved that the copy works. The parser is exactly the thing under test
 * here — the app has to read the Odoo export byte for byte — so the suite has
 * to run the real one.
 *
 * `tsc` is already a devDependency (see `npm run typecheck`), so this adds no
 * dependency. Output goes to a temp directory and is never checked in.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Compiles one self-contained .ts file and returns its exports. */
export function loadTs(file) {
  const out = mkdtempSync(path.join(tmpdir(), 'cite-ts-'));
  try {
    execFileSync(
      'npx',
      // --ignoreConfig: tsconfig.json sets paths and JSX for the app; none of
      // it applies to a single dependency-free module.
      [
        'tsc',
        file,
        '--ignoreConfig',
        '--outDir',
        out,
        '--module',
        'commonjs',
        '--target',
        'es2020',
        '--skipLibCheck',
      ],
      { stdio: 'pipe', shell: true },
    );
  } catch (e) {
    throw new Error(`Could not compile ${file}:\n${e.stdout?.toString() ?? e.message}`);
  }
  const require = createRequire(import.meta.url);
  return require(path.join(out, path.basename(file).replace(/\.ts$/, '.js')));
}
