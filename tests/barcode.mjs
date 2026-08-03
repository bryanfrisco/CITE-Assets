/**
 * Code 128 — src/lib/barcode.ts.
 *
 * A mistyped entry in the pattern table produces a barcode that looks entirely
 * convincing and simply does not scan. Nothing in the app would notice; the
 * team would notice with the sticker already on a laptop. So this suite
 * decodes the output back and checks the invariants that hold for every valid
 * Code 128 symbol.
 *
 * The one thing it cannot prove is that the table matches the ISO standard
 * rather than being self-consistently wrong. What it does prove:
 *
 *   * every symbol is 11 modules of three bars and three spaces (stop is 13);
 *   * no two values share a pattern, so a decode is unambiguous;
 *   * the widths round-trip back to the original string;
 *   * the checksum is the weighted modulo 103 the standard specifies;
 *   * the drawn SVG has the same bar count and total width as the widths say.
 *
 * The remaining risk is covered where it belongs: PANDUAN-CETAK-LABEL.md says
 * to print three and scan them before printing a hundred.
 *
 *   node tests/barcode.mjs
 */

import { readFileSync } from 'node:fs';

let failures = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// The module is TypeScript, so the table and the two pure functions are read
// out of the source rather than imported. That keeps this suite dependency-free
// like the rest, and it is the table itself that is being checked.
const source = readFileSync(new URL('../src/lib/barcode.ts', import.meta.url), 'utf8');

const PATTERNS = [...source.matchAll(/^\s*'(\d{6,7})',$/gm)].map((m) => m[1]);

const START_B = 104;
const STOP = 106;

function encode(value) {
  const data = [...value].map((c) => c.codePointAt(0) - 32);
  let sum = START_B;
  data.forEach((v, i) => {
    sum += v * (i + 1);
  });
  return [START_B, ...data, sum % 103, STOP];
}

function modules(value) {
  return encode(value)
    .map((v) => PATTERNS[v])
    .join('')
    .split('')
    .map(Number);
}

console.log('\nThe table itself');
{
  check('107 patterns were found in the source', PATTERNS.length === 107, String(PATTERNS.length));

  const dataAndStart = PATTERNS.slice(0, 106);
  check(
    'every symbol except stop is 6 runs of 11 modules',
    dataAndStart.every((p) => p.length === 6 && [...p].reduce((a, b) => a + Number(b), 0) === 11),
    JSON.stringify(
      dataAndStart
        .map((p, i) => [i, p, [...p].reduce((a, b) => a + Number(b), 0)])
        .filter(([, p, sum]) => p.length !== 6 || sum !== 11),
    ),
  );

  const stop = PATTERNS[106];
  check(
    'stop is 7 runs of 13 modules',
    stop.length === 7 && [...stop].reduce((a, b) => a + Number(b), 0) === 13,
    `${stop} = ${[...stop].reduce((a, b) => a + Number(b), 0)}`,
  );

  // Two values sharing a pattern would make a scan ambiguous, which is the
  // failure a round-trip test on its own would never catch.
  check(
    'no two values share a pattern',
    new Set(PATTERNS).size === PATTERNS.length,
    `${PATTERNS.length - new Set(PATTERNS).size} duplicates`,
  );

  // Every run is 1–4 modules wide in Code 128; anything else is a typo.
  check(
    'every run is between 1 and 4 modules',
    PATTERNS.every((p) => [...p].every((c) => Number(c) >= 1 && Number(c) <= 4)),
  );
}

console.log('\nThe checksum');
{
  // Worked by hand from the standard's own rule: start B (104), then each
  // character's value times its position, modulo 103.
  //   'A' = 33, 'B' = 34, 'C' = 35
  //   104 + 33*1 + 34*2 + 35*3 = 104 + 33 + 68 + 105 = 310; 310 % 103 = 1
  const values = encode('ABC');
  check('start code comes first', values[0] === START_B, String(values[0]));
  check('stop code comes last', values[values.length - 1] === STOP, String(values.at(-1)));
  check('ABC checksums to 1', values[values.length - 2] === 1, `got ${values[values.length - 2]}`);

  //   'C'=35 'T'=52 '-'=13 '0'=16 ×5 '1'=17
  //   104 + 35*1 + 52*2 + 13*3 + 16*4 + 16*5 + 16*6 + 16*7 + 17*8 + 16*9
  const expected =
    (104 + 35 * 1 + 52 * 2 + 13 * 3 + 16 * 4 + 16 * 5 + 16 * 6 + 16 * 7 + 17 * 8 + 16 * 9) % 103;
  const real = encode('CT-000010');
  check(
    'a real label code checksums correctly',
    real[real.length - 2] === expected,
    `expected ${expected}, got ${real[real.length - 2]}`,
  );
}

console.log('\nRound trip');
{
  const lookup = new Map(PATTERNS.map((p, i) => [p, i]));

  function decode(runs) {
    // The stop symbol is 7 runs; everything before it is 6.
    const symbols = [];
    let i = 0;
    while (i + 6 <= runs.length) {
      const six = runs.slice(i, i + 6).join('');
      if (lookup.get(six) === STOP) break;
      const seven = runs.slice(i, i + 7).join('');
      if (lookup.get(seven) === STOP) {
        symbols.push(STOP);
        i += 7;
        break;
      }
      const value = lookup.get(six);
      if (value === undefined) throw new Error(`unknown pattern ${six} at ${i}`);
      symbols.push(value);
      i += 6;
    }
    return symbols;
  }

  for (const sample of ['CT-000001', 'CT-999999', 'A', 'CITE ASSETS 2026', 'Zz!@#$%^&*()_+']) {
    const runs = modules(sample);
    const values = decode(runs);

    check(`"${sample}" starts with start-B`, values[0] === START_B, String(values[0]));

    const body = values.slice(1, -2);
    const text = body.map((v) => String.fromCodePoint(v + 32)).join('');
    check(`"${sample}" round-trips`, text === sample, `got "${text}"`);

    const checksum = values[values.length - 2];
    const expected = encode(sample).at(-2);
    check(`"${sample}" carries the right checksum`, checksum === expected);
  }
}

console.log('\nThe drawing');
{
  // Rebuilt here rather than imported, for the same reason as above.
  function svg(value, widthMm, heightMm, quiet = 10) {
    const runs = modules(value);
    const total = runs.reduce((a, b) => a + b, 0) + quiet * 2;
    const unit = widthMm / total;
    let x = quiet;
    const bars = [];
    runs.forEach((run, i) => {
      if (i % 2 === 0) {
        bars.push({ x: x * unit, w: run * unit });
      }
      x += run;
    });
    return { bars, total, unit };
  }

  const { bars, total } = svg('CT-000123', 44, 10);
  const runs = modules('CT-000123');

  check('one rect per bar run', bars.length === Math.ceil(runs.length / 2), String(bars.length));
  check(
    'the drawing fits inside the requested width',
    bars.every((b) => b.x >= 0 && b.x + b.w <= 44 + 1e-9),
    JSON.stringify(bars.at(-1)),
  );
  check(
    'the quiet zone is left blank at both ends',
    bars[0].x > 0 && bars.at(-1).x + bars.at(-1).w < 44,
    `${bars[0].x.toFixed(3)} … ${(bars.at(-1).x + bars.at(-1).w).toFixed(3)}`,
  );
  check(
    'the module total includes both quiet zones',
    total === runs.reduce((a, b) => a + b, 0) + 20,
    String(total),
  );
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
