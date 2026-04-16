#!/usr/bin/env node
// Reports how many "fresh" stories exist for each UTC hour of a
// representative day. Catches dataset gaps before they ship.
//
// A story is "fresh" when its local time is 1..4 hours past `local_hour`.
// If any UTC hour shows 0 fresh stories, the runtime falls back to
// index rotation — but it means that whole hour the experience is less
// time-anchored than intended.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(resolve(here, "../data/stories.json"), "utf8")
);

const FRESH_WINDOW = 4;

function localHourIn(tz, now) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false
  });
  const part = fmt.formatToParts(now).find((p) => p.type === "hour");
  return ((Number(part?.value ?? "0") % 24) + 24) % 24;
}

// Pick a representative weekday in mid-January to avoid DST edges.
const baseUtc = new Date(Date.UTC(2026, 0, 14, 0, 0, 0));

let zeroHours = 0;
let total = 0;
const rows = [];

for (let h = 0; h < 24; h++) {
  const probe = new Date(baseUtc.getTime() + h * 3600 * 1000);
  const fresh = data.filter((s) => {
    const local = localHourIn(s.timezone, probe);
    const elapsed = ((local - s.local_hour) % 24 + 24) % 24;
    return elapsed >= 1 && elapsed <= FRESH_WINDOW;
  });
  rows.push({ utc: h, count: fresh.length, sample: fresh[0]?.city ?? "—" });
  total += fresh.length;
  if (fresh.length === 0) zeroHours++;
}

const w = (s, n) => String(s).padEnd(n);
console.log("");
console.log(`  Once — coverage check (${data.length} stories)`);
console.log(`  Window: 1..${FRESH_WINDOW}h after local_hour`);
console.log("");
console.log(`  ${w("UTC hour", 10)}${w("fresh", 8)}sample`);
console.log(`  ${"-".repeat(48)}`);
for (const r of rows) {
  const flag = r.count === 0 ? " ⚠" : "";
  console.log(
    `  ${w(String(r.utc).padStart(2, "0") + ":00", 10)}${w(
      r.count + flag,
      8
    )}${r.sample}`
  );
}
console.log("");
console.log(
  `  total candidate-hours: ${total}    avg/hour: ${(total / 24).toFixed(1)}`
);
console.log(
  `  uncovered hours: ${zeroHours}${zeroHours > 0 ? " ⚠ (will use fallback rotation)" : ""}`
);
console.log("");

// Non-zero exit if any hour is uncovered, so CI can fail loudly.
process.exit(zeroHours > 0 ? 1 : 0);
