import "dotenv/config";

const secret = process.env.CRON_SECRET;
const base = process.env.CRON_BASE_URL;
if (!secret || !base) throw new Error("Set CRON_SECRET dan CRON_BASE_URL di .env server");
const dryRun = process.argv.includes("--dry-run");
const url = new URL(base);
if (!["http:", "https:"].includes(url.protocol)) throw new Error("CRON_BASE_URL tidak valid");
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
let failed = false;
for (let daysAgo = 3; daysAgo >= 1; daysAgo--) {
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - daysAgo);
  const date = day.toISOString().slice(0, 10);
  try {
    // Preserve existing records before filling gaps; capture generated records afterwards.
    for (const job of ["attendance-backup", "attendance-absent", "attendance-backup"]) {
      const target = new URL(`/api/cron/${job}`, url);
      target.searchParams.set("date", date);
      if (dryRun) target.searchParams.set("dryRun", "true");
      const response = await fetch(target, {
        headers: { Authorization: `Bearer ${secret}` },
        redirect: "error",
        signal: AbortSignal.timeout(300000),
      });
      const result = await response.json();
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), job, date, status: response.status, result }));
      if (!response.ok) throw new Error(`Job ${job} gagal: HTTP ${response.status}`);
    }
  } catch (error) {
    failed = true;
    console.error(JSON.stringify({ date, error: error.message }));
  }
}
if (failed) process.exitCode = 1;
