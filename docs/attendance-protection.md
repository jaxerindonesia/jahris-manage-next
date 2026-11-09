# Attendance cron and recovery

The VPS scheduler is separate from Next.js. Deploying this code does not install
a crontab. Existing attendance and payroll calculations are unchanged.

## Storage setup (before deploying)

Create a separate **private** MinIO bucket, for example `hr-attendance-backups`.
Do not enable anonymous access. Set server environment variables:

```dotenv
MINIO_BUCKET_ATTENDANCE_BACKUPS=hr-attendance-backups
CRON_BASE_URL=http://127.0.0.1:3000
CRON_SECRET=<a-long-random-server-only-secret>
```

Use the actual production app port for `CRON_BASE_URL`. Reuse an existing
`CRON_SECRET` if the current scheduler already uses it. Never commit `.env`.
The MinIO service account must be able to check the backup bucket's existence
and policy, read source attendance photos, and write/copy backup objects.
App admin credentials do not provide access to these archives. For protection
against compromised server/storage credentials as well, configure MinIO Object
Lock/retention and an independently controlled backup outside this application.
No automatic retention/deletion is installed by this feature.

**Manual attendance edit/delete now requires a complete backup first.** If the
private bucket is missing, public, or a referenced photo cannot be copied, the
request returns 503 and leaves the attendance unchanged. Configure storage before
deploying. This deliberately prevents edits/deletes when preservation cannot be
guaranteed.

Each archive contains `snapshot.json` and copies of check-in/out photos, grouped
by tenant ID, branch ID, work date and attendance ID. Snapshot paths are random
and append-only in application code. Pre-change snapshots record the actor, role,
IP, attempted changes and original attendance. They represent an attempted
mutation; confirm successful changes using `security_audit` application logs.
Snapshots never appear as public URLs or in the ordinary admin API.

## Schedule on the VPS

From the production project directory after a successful build and PM2 reload:

```bash
node scripts/run-attendance-cron.mjs --dry-run
```

Dry-run checks authorization, storage privacy and counts records; it does not
write backups or change attendance, and does not test copying actual images.
Run once without `--dry-run` to verify real storage before relying on the job:

```bash
node scripts/run-attendance-cron.mjs
```

The runner checks the previous three Jakarta dates, oldest first. For each date
it backs up existing attendance, calls the existing Alpha cron, then backs up the
result. If the first backup fails, Alpha creation for that date is skipped.
Overlapping runs must be prevented using `flock`. Each API request times out
after five minutes. Failed jobs exit nonzero and must be monitored.

Check `date '+%Z %z'` and `command -v node` on the server. For a server using WIB
and Node at `/usr/bin/node`, add this **single line** via `crontab -e` (adjust paths
to the actual production checkout):

```cron
15 1 * * * cd /home/jaxerid/jaxer-project/production/hr-manage-next && /usr/bin/flock -n /tmp/jahris-attendance-cron.lock /usr/bin/node scripts/run-attendance-cron.mjs >> attendance-cron.log 2>&1
```

For a UTC server, use `15 18 * * *` instead (01:15 WIB the next day). Replace an
older attendance-absent entry with the runner rather than scheduling both. Keep
the existing auto-checkout entry if it is already used. `vercel.json` schedules
only Vercel deployments and does not configure this VPS.

The Alpha endpoint supports `?date=YYYY-MM-DD&dryRun=true`, defaults to yesterday
in Jakarta, and rejects today/future/invalid dates. It reuses branch regular and
employee shift schedules, skips unfinished overnight shifts and holidays, honors
approved submissions, and does not duplicate existing rows. The next daily run
revisits overnight shifts. Missed runs longer than three days require explicit
dated requests. It does not fabricate check-in evidence for deleted records.

## Recovery by a server operator

Find `snapshot.json` using the private MinIO console or the backup object key in
the `attendances.delete` audit log. First preview without modifying anything:

```bash
node scripts/restore-attendance-backup.mjs '<tenant>/<branch>/<date>/<attendance>/<snapshot>/snapshot.json'
```

After checking the employee, tenant and date, restore with:

```bash
node scripts/restore-attendance-backup.mjs '<tenant>/<branch>/<date>/<attendance>/<snapshot>/snapshot.json' --apply
```

The operator-only script verifies the employee/tenant and photos, creates fresh
photo URLs and recreates the missing attendance. It refuses to overwrite an
existing ID or same employee/date (including an Alpha recreated by cron). An
operator must review conflicting rows first; never automatically overwrite them.
Restoring a pre-edit record requires manual conflict review. Overtime records
are not recreated/relinked, and saved payrolls are not recalculated by recovery.

This protects manual edit/delete through the attendance API and records present
when the scheduled backup runs. Direct SQL changes, employee/tenant deletion
with cascading records, and evidence deleted before the first backup require
separate database/storage backups. Keep server and MinIO access independent of
ordinary HR/admin accounts. Historic schedules use the existing scheduling model;
changing a branch schedule does not reconstruct old assignments.
