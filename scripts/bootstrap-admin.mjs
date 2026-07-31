/**
 * Creates the single starting account on a fresh environment.
 *
 * The client's brief for production was "satu akun saja, admin": no seeded
 * people, no demo sign-ins, nothing to clean up later. Every other account is
 * created from inside the app afterwards, where the Super Admin decides who can
 * sign in at all.
 *
 * ORDER MATTERS. `link_auth_user_to_account()` (migration 0004) fires on insert
 * into auth.users and claims a waiting `accounts` row by email — so the account
 * has to exist, with can_login = true, BEFORE the auth user is created.
 * Reversing the two leaves an auth user linked to nothing, which presents as a
 * successful sign-in followed by an empty session.
 *
 * Never hardcodes a secret: pass them in.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   ADMIN_EMAIL=admin@aspire.id ADMIN_PASSWORD=<password> \
 *   node scripts/bootstrap-admin.mjs
 */

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@aspire.id').toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!URL || !KEY || !PASSWORD) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ADMIN_PASSWORD.');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const response = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// --- 1. the reference data the account points at ----------------------------
const [locations, departments] = await Promise.all([
  rest('locations?select=id,code'),
  rest('departments?select=id,name'),
]);

const ho = locations.find((l) => l.code === 'HO');
if (!ho) throw new Error('No Head Office location — were the migrations applied?');
const corporateIt = departments.find((d) => d.name === 'Corporate IT');

// --- 2. the account row, first ----------------------------------------------
const existing = await rest(
  `accounts?select=id,auth_user_id&email=eq.${encodeURIComponent(EMAIL)}`,
);

let accountId = existing[0]?.id;
if (accountId) {
  console.log(`account for ${EMAIL} already exists`);
} else {
  const [created] = await rest('accounts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      full_name: 'Administrator',
      email: EMAIL,
      department_id: corporateIt?.id ?? null,
      location_id: ho.id,
      can_login: true,
      role: 'super_admin',
      is_active: true,
    }),
  });
  accountId = created.id;
  console.log(`created account ${accountId} (${EMAIL}, super_admin)`);
}

// --- 3. the auth user, second — the trigger claims the row above ------------
const listed = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=200`, { headers }).then(
  (r) => r.json(),
);

const already = (listed.users ?? []).find((u) => (u.email ?? '').toLowerCase() === EMAIL);

if (already) {
  console.log('auth user already exists — resetting its password');
  const reset = await fetch(`${URL}/auth/v1/admin/users/${already.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  });
  if (!reset.ok) throw new Error(`password reset failed: ${await reset.text()}`);
} else {
  const response = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  if (!response.ok) throw new Error(`could not create the auth user: ${await response.text()}`);
  console.log('created the auth user');
}

// --- 4. open with both locations in scope ------------------------------------
for (const location of locations) {
  await fetch(`${URL}/rest/v1/account_scope_preferences`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ account_id: accountId, location_id: location.id }),
  });
}

// --- 5. prove the link, rather than assume it -------------------------------
const [linked] = await rest(
  `accounts?select=id,email,role,auth_user_id,can_login&email=eq.${encodeURIComponent(EMAIL)}`,
);

if (!linked?.auth_user_id) {
  console.error(
    '\nThe account exists but is NOT linked to an auth user.\n' +
      'That means the auth_user_created trigger did not match it — check that\n' +
      'can_login is true and the emails agree exactly.',
  );
  process.exit(1);
}

console.log('\nReady:');
console.log(`  email    ${linked.email}`);
console.log(`  role     ${linked.role}`);
console.log(`  linked   ${linked.auth_user_id}`);
console.log(`  scope    ${locations.length} location(s)`);
