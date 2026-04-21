/**
 * Run ingest for just the 14 new cities, sequentially. Reports
 * per-city: queued count + top-1 score. Used to validate that new
 * sources actually produce A+B-shaped candidates before they go
 * live in the daily batch.
 */
import { runIngest } from "@/lib/pipeline";

// Retry pass: exclude cities that already produced (havana, sao-paulo,
// portland) and the deactivated Tromsø. Test whether the loosened
// city-match rule + fresh dedup lets starved cities surface content.
const NEW_CITIES = [
  "almaty", "kingston", "port-au-prince", "lima",
  "tunis", "cairo", "honolulu",
  "kathmandu", "yogyakarta", "montreal"
];

async function main() {
  console.log(`Running ingest for ${NEW_CITIES.length} new cities...\n`);
  const results: Array<{ id: string; queued: number; top: string }> = [];
  for (const id of NEW_CITIES) {
    process.stdout.write(`  ${id.padEnd(18)} ... `);
    try {
      const r = await runIngest({ cityId: id });
      const top = r.scores
        ? `s${r.scores.specificity}·r${r.scores.resonance}·g${r.scores.register}`
        : "—";
      const tag = r.queued_ids.length > 0 ? `✓ ${r.queued_ids.length}` : "·  0";
      console.log(`${tag} (top ${top}) | ${r.reason}`);
      results.push({ id, queued: r.queued_ids.length, top });
    } catch (e) {
      console.log(`✗ ERROR: ${e instanceof Error ? e.message : e}`);
      results.push({ id, queued: 0, top: "err" });
    }
  }
  console.log("\n── Summary ──");
  const producing = results.filter(r => r.queued > 0);
  const dud = results.filter(r => r.queued === 0);
  console.log(`Producing (${producing.length}/${NEW_CITIES.length}): ${producing.map(r => r.id).join(", ")}`);
  console.log(`Duds (${dud.length}/${NEW_CITIES.length}): ${dud.map(r => r.id).join(", ")}`);
}
main().catch(e => { console.error(e); process.exit(1); });
