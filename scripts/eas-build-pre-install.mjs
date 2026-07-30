/**
 * Runs on the EAS builder immediately before dependencies are installed.
 *
 * WHY THIS EXISTS
 * ---------------
 * EAS runs `npm ci` when a lockfile is present, and `npm ci` refuses to install
 * unless package.json and package-lock.json agree exactly. They cannot agree
 * here, for a reason that is npm's and not this project's:
 *
 *   `lightningcss` (pulled in by Expo's web pipeline) depends on
 *   `@napi-rs/wasm-runtime`, whose `@emnapi/*` dependencies are OPTIONAL and
 *   platform-conditional. Installing on Windows selects the native
 *   `lightningcss-win32-x64-msvc` binary and never materialises the WASM
 *   fallback, so those packages are left out of the lockfile. The Linux builder
 *   then computes that it does need them, and `npm ci` fails:
 *
 *     Missing: @emnapi/core@1.11.3 from lock file
 *
 *   Pinning them by hand does not hold either: they are declared as `^1.x`, so
 *   the version the builder resolves moves every time a new one is published.
 *
 * Removing the lockfile here makes EAS fall back to `npm install`, which
 * resolves against the current registry and cannot be "out of sync". The
 * lockfile stays committed, so local installs remain reproducible — only the
 * builder resolves fresh.
 *
 * THE COST, STATED PLAINLY
 * ------------------------
 * Builds are no longer byte-for-byte reproducible: two builds of the same
 * commit can pick up different patch versions of transitive dependencies. That
 * is acceptable for the current test builds. Before this app ships for real,
 * move to pnpm or Yarn — neither has npm's cross-platform optional-dependency
 * bug — and delete this file.
 */

import { existsSync, unlinkSync } from 'node:fs';

if (existsSync('package-lock.json')) {
  unlinkSync('package-lock.json');
  console.log(
    'eas-build-pre-install: removed package-lock.json so the builder resolves ' +
      'dependencies with `npm install`. See scripts/eas-build-pre-install.mjs.',
  );
} else {
  console.log('eas-build-pre-install: no package-lock.json to remove.');
}
