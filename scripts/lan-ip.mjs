/**
 * Prints the LAN address a phone should use to reach the local Supabase stack,
 * and checks whether the value in eas.json still matches.
 *
 * A test build has EXPO_PUBLIC_SUPABASE_URL compiled into it, so the address is
 * fixed at build time — and it changes whenever this machine joins a different
 * network. Run this before `npm run build:apk`.
 *
 *   node scripts/lan-ip.mjs
 */

import { networkInterfaces } from 'node:os';
import { readFileSync } from 'node:fs';

const candidates = Object.entries(networkInterfaces())
  .flatMap(([name, addresses]) => (addresses ?? []).map((a) => ({ ...a, name })))
  .filter((a) => a.family === 'IPv4' && !a.internal)
  // Docker and WSL virtual adapters are not reachable from a phone.
  .filter((a) => !/^(vEthernet|WSL|Docker|Loopback)/i.test(a.name));

if (candidates.length === 0) {
  console.error('No LAN address found — is this machine on Wi-Fi?');
  process.exit(1);
}

const wifi = candidates.find((a) => /wi-?fi|wlan/i.test(a.name)) ?? candidates[0];
const url = `http://${wifi.address}:54321`;

console.log(`\nThis machine on the LAN:  ${wifi.address}  (${wifi.name})`);
console.log(`Supabase for a phone:     ${url}\n`);

if (candidates.length > 1) {
  console.log('Other addresses seen:');
  for (const a of candidates) if (a !== wifi) console.log(`  ${a.address}  (${a.name})`);
  console.log('');
}

const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const configured = eas.build?.preview?.env?.EXPO_PUBLIC_SUPABASE_URL;

if (configured === url) {
  console.log('eas.json preview profile matches. Ready to build.\n');
} else {
  console.log(`eas.json preview profile says:  ${configured}`);
  console.log(`Update it to:                   ${url}`);
  console.log('The URL is compiled into the build, so fix it BEFORE building.\n');
  process.exit(1);
}
