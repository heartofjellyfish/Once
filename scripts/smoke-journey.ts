import { runIngest } from "@/lib/pipeline";
(async () => {
  const r = await runIngest({ cityId: "havana" });
  console.log("queued:", r.queued_ids.length, "|", r.reason);
})();
