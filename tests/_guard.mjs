/**
 * Refuses to run a suite against anything but a local stack.
 *
 * Every suite here writes: it creates assets, assigns them, records movements
 * and uploads files. Several of those writes are append-only by design and
 * cannot be undone. Pointing .env at the production project — a one-line
 * mistake — would silently fill the client's real register with test data.
 *
 * The check is on the URL rather than on a flag, because the dangerous case is
 * exactly the one where nobody remembered to set a flag.
 */

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

export function assertLocal(url) {
  if (LOCAL.test(url)) return;

  if (process.env.ALLOW_NON_LOCAL_TESTS === 'yes-i-mean-it') {
    console.warn(`\n!! Running against a NON-LOCAL database: ${url}\n`);
    return;
  }

  console.error(
    `\nRefusing to run: ${url} is not a local Supabase stack.\n\n` +
      'These suites write, and some of what they write cannot be deleted\n' +
      '(movements and bast_versions are append-only). Point\n' +
      'EXPO_PUBLIC_SUPABASE_URL at http://127.0.0.1:54321 and run\n' +
      '`supabase start` first.\n\n' +
      'If you genuinely mean to target a remote database, set\n' +
      'ALLOW_NON_LOCAL_TESTS=yes-i-mean-it.\n',
  );
  process.exit(1);
}
