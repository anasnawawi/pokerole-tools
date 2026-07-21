// Downloads front + back Pokémon sprites into public/sprites/pokemon for offline use.
// Tiered by dex number, falling through on 404: FRLG (1-386) → Gen5 (387-649) → default (650+).
// Resumable: skips files that already exist. Optional arg = max dex number (default 1025).
//
//   node scripts/fetch-sprites.mjs            # bundle 1-1025
//   node scripts/fetch-sprites.mjs 386        # FRLG range only (small)
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "sprites", "pokemon");
const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const MAX = Number(process.argv[2]) || 1025;
const CONCURRENCY = 16;

// Ordered source tiers per side. First tier whose primary range matches is tried first,
// then we fall through the remaining tiers on 404 so gaps still resolve to *some* sprite.
function urlsFor(n, back) {
  const b = back ? "back/" : "";
  const frlg = `${BASE}/versions/generation-iii/firered-leafgreen/${b}${n}.png`;
  const gen5 = `${BASE}/versions/generation-v/black-white/${b}${n}.png`;
  const def = `${BASE}/${b}${n}.png`;
  if (n <= 386) return [frlg, gen5, def];
  if (n <= 649) return [gen5, def];
  return [def];
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function fetchFirst(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch { /* network hiccup — try next */ }
  }
  return null;
}

async function grab(n) {
  const out = [];
  for (const back of [false, true]) {
    const dest = join(OUT, back ? "back" : "", `${n}.png`);
    if (await exists(dest)) { out.push("skip"); continue; }
    const buf = await fetchFirst(urlsFor(n, back));
    if (!buf) { out.push("MISS"); continue; }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    out.push("ok");
  }
  return out; // [front, back]
}

async function main() {
  await mkdir(join(OUT, "back"), { recursive: true });
  const nums = Array.from({ length: MAX }, (_, i) => i + 1);
  let done = 0, missed = [];
  // simple worker pool
  const queue = nums.slice();
  async function worker() {
    while (queue.length) {
      const n = queue.shift();
      const [f, b] = await grab(n);
      if (f === "MISS") missed.push(`${n} front`);
      if (b === "MISS") missed.push(`${n} back`);
      done++;
      if (done % 50 === 0) process.stdout.write(`  …${done}/${MAX}\n`);
    }
  }
  console.log(`Fetching sprites 1-${MAX} into ${OUT}`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Done. ${done} dex numbers processed.`);
  if (missed.length) console.log(`No sprite for: ${missed.join(", ")}`);
}

main().catch(e => { console.error(e); process.exit(1); });
