import { runIngest } from "@/lib/pipeline";
(async () => {
  for (const cityId of ["havana", "sao-paulo", "tokyo"]) {
    console.log(`\n── ${cityId} ──`);
    const r = await runIngest({ cityId });
    console.log(`  queued: ${r.queued_ids.length} | ${r.reason}`);
    if (r.scores) console.log(`  top: ${JSON.stringify(r.scores)}`);
  }
})();
