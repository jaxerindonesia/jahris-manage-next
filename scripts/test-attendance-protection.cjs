/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, mocks, env = {}, cache = new Map(), globals = {}) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date, Map, Set, Buffer, URL, Response, console: { info() {}, warn() {}, error() {} },
    process: { env }, require: (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`, mocks, env, cache, globals);
      return require(name);
    }, ...globals,
  });
  return exports;
}

const row = {
  id: "attendance", tenantId: "tenant", branchId: "branch", userId: "employee",
  attendanceDay: new Date("2026-11-06T00:00:00Z"),
  updatedAt: new Date("2026-11-06T08:00:00Z"), status: "Present",
  checkInFaceImage: "https://storage.example/photos/tenant/check-in.jpg", checkOutFaceImage: null,
};

function storageFixture(options = {}) {
  const events = [];
  const storage = {
    bucketExists: async () => true,
    getBucketPolicy: async () => {
      if (options.public) return JSON.stringify({ Statement: [{ Effect: "Allow", Principal: "*" }] });
      throw Object.assign(new Error("No policy"), { code: "NoSuchBucketPolicy" });
    },
    copyObject: async (source, destination) => {
      events.push({ action: "copy", source, destination });
      if (options.failCopy) throw new Error("Missing photo");
    },
    putObject: async (bucket, key, body) => {
      events.push({ action: "put", bucket, key, snapshot: JSON.parse(body.toString()) });
      if (options.failWrite) throw new Error("Write denied");
    },
  };
  return { storage, events, mocks: {
    "@/lib/minio": { default: storage, BUCKET_AVATARS: "photos", __esModule: true },
    minio: { CopySourceOptions: class { constructor(value) { Object.assign(this, value); } },
      CopyDestinationOptions: class { constructor(value) { Object.assign(this, value); } } },
  } };
}

test("cron rejects missing/wrong credentials and invalid/future dates", () => {
  const { isAuthorizedCron } = load("lib/auth/cron.ts", {}, { CRON_SECRET: "test-only" });
  assert.equal(isAuthorizedCron(new Request("https://app.example")), false);
  assert.equal(isAuthorizedCron(new Request("https://app.example", { headers: { Authorization: "Bearer wrong" } })), false);
  assert.equal(isAuthorizedCron(new Request("https://app.example", { headers: { Authorization: "Bearer test-only" } })), true);
  const { getAttendanceCronDay } = load("lib/helper/attendance-cron.ts", {});
  const now = new Date("2026-11-08T18:00:00Z"); // Nov 9 Jakarta.
  assert.equal(getAttendanceCronDay(null, now).toISOString(), "2026-11-08T00:00:00.000Z");
  for (const value of ["2026-11-09", "2026-11-10", "2026-02-30", "invalid"]) {
    assert.throws(() => getAttendanceCronDay(value, now));
  }
});

test("private snapshot preserves photos, original record and actor; public bucket is refused", async () => {
  const fixture = storageFixture();
  const { backupAttendance } = load("lib/helper/attendance-backup.ts", fixture.mocks, { MINIO_BUCKET_ATTENDANCE_BACKUPS: "private-archive" });
  const context = { action: "before-delete", actorUserId: "admin" };
  const result = await backupAttendance(row, context);
  assert.equal(result.bucket, "private-archive");
  assert.deepEqual(fixture.events.map((e) => e.action), ["copy", "put"]);
  const snapshot = fixture.events[1].snapshot;
  assert.equal(snapshot.attendance.id, row.id);
  assert.equal(snapshot.context.actorUserId, "admin");
  assert.equal(snapshot.evidence[0].originalUrl, row.checkInFaceImage);
  assert.ok(result.objectName.startsWith("tenant/branch/2026-11-06/attendance/"));
  const publicFixture = storageFixture({ public: true });
  const publicHelper = load("lib/helper/attendance-backup.ts", publicFixture.mocks, { MINIO_BUCKET_ATTENDANCE_BACKUPS: "public" });
  await assert.rejects(() => publicHelper.backupAttendance(row, context));
  assert.equal(publicFixture.events.length, 0);
});

function attendanceRoute(options = {}) {
  const fixture = storageFixture(options);
  const audit = [];
  const db = {
    attendance: {
      findFirst: async (args) => { assert.equal(args.where.tenantId, "tenant"); return row; },
      deleteMany: async (args) => { fixture.events.push({ action: "delete", args }); return { count: options.concurrent ? 0 : 1 }; },
      updateMany: async (args) => { fixture.events.push({ action: "update", args }); return { count: 1 }; },
      findUnique: async () => row,
    },
    overtime: { findFirst: async () => null },
    user: { findFirst: async () => null },
  };
  const mocks = {
    ...fixture.mocks,
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@prisma/client": { Prisma: {} },
    "@/lib/prisma": db,
    "@/lib/auth/tenant": {
      requireSessionUser: async () => ({ user: { id: "admin", tenantId: "tenant", roleName: "Admin" } }),
      ensureTenantScope: () => "tenant",
    },
    "@/lib/auth/permission": { requirePermission: () => options.forbidden ? Response.json({}, { status: 403 }) : null },
    "@/lib/security/audit-log": { writeAuditLog: (entry) => audit.push(entry) },
  };
  mocks["@/lib/minio"].deleteFromMinio = async () => fixture.events.push({ action: "remove-original-photo" });
  return { ...fixture, audit, route: load("app/api/attendances/[id]/route.ts", mocks,
    options.unconfigured ? {} : { MINIO_BUCKET_ATTENDANCE_BACKUPS: "private-archive" }) };
}

test("delete backs up before deleting; audit records actor and archive reference", async () => {
  const f = attendanceRoute();
  const response = await f.route.DELETE(new Request("https://app.example/api/attendances/attendance", { method: "DELETE" }), { params: { id: row.id } });
  assert.equal(response.status, 200);
  assert.deepEqual(f.events.map((e) => e.action), ["copy", "put", "delete", "remove-original-photo"]);
  assert.equal(f.events[2].args.where.updatedAt, row.updatedAt);
  assert.equal(f.audit[0].actorUserId, "admin");
  assert.equal(f.audit[0].metadata.backup.bucket, "private-archive");
});

test("backup errors, missing config and missing permission never delete data", async () => {
  for (const options of [{ failCopy: true }, { failWrite: true }, { unconfigured: true }, { public: true }, { forbidden: true }]) {
    const f = attendanceRoute(options);
    const response = await f.route.DELETE(new Request("https://app.example", { method: "DELETE" }), { params: { id: row.id } });
    assert.equal(response.status, options.forbidden ? 403 : 503);
    assert.equal(f.events.some((e) => e.action === "delete"), false);
    assert.equal(f.audit.length, 0);
  }
});

test("concurrent changes abort deletion and failed backups abort edits", async () => {
  const f = attendanceRoute({ concurrent: true });
  const response = await f.route.DELETE(new Request("https://app.example", { method: "DELETE" }), { params: { id: row.id } });
  assert.equal(response.status, 409);
  assert.equal(f.audit.length, 0);
  const editing = attendanceRoute({ failCopy: true });
  const result = await editing.route.PUT(new Request("https://app.example", {
    method: "PUT", body: JSON.stringify({ status: "Absent" }),
  }), { params: { id: row.id } });
  assert.equal(result.status, 503);
  assert.equal(editing.events.some((e) => e.action === "update"), false);
});

test("manual edits cannot move attendance to a different tenant", async () => {
  const f = attendanceRoute();
  const result = await f.route.PUT(new Request("https://app.example", {
    method: "PUT", body: JSON.stringify({ userId: "outside-tenant" }),
  }), { params: { id: row.id } });
  assert.equal(result.status, 400);
  assert.equal(f.events.length, 0);
});

test("Alpha cron respects completed regular schedules, unfinished overnight shifts, approved leave and dry-run", async () => {
  class FixedDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super("2026-11-08T17:10:00Z"); // Nov 9 00:10 WIB.
    }
  }
  const events = [];
  let existing = [];
  const prisma = {
    user: { findMany: async () => ["regular", "night", "off", "leave"].map((id) => ({
      id, tenantId: "tenant", branchId: "branch", branch: { scheduleType: id === "night" ? "SHIFT" : "REGULAR", isActive: true },
    })) },
    attendance: {
      findMany: async () => existing,
      createMany: async (args) => { events.push(args); return { count: args.data.length }; },
    },
    overtime: { findMany: async () => [] },
    submission: { findMany: async (args) => {
      assert.equal(args.where.status, "APPROVED");
      assert.equal(args.where.deletedAt, null);
      return [{ userId: "leave", submissionType: { name: "Cuti" } }];
    } },
  };
  const mocks = {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/lib/prisma": prisma,
    "@/lib/helper/submission-attendance": { AUTO_ABSENT_NOTE: "cron", AUTO_SUBMISSION_ATTENDANCE_NOTE: "approved" },
    "@/lib/helper/holiday": { getNationalHolidayByDate: async () => null },
    "@/lib/helper/work-schedule": { getScheduledWorkDays: async (_, user) => user === "off" ? [] : [{
      workDate: new Date("2026-11-08T00:00:00Z"),
      endAt: new Date(user === "night" ? "2026-11-08T23:00:00Z" : "2026-11-08T10:00:00Z"),
    }] },
  };
  const route = load("app/api/cron/attendance-absent/route.ts", mocks, { CRON_SECRET: "test-only" }, new Map(), { Date: FixedDate, console });
  const request = (query = "") => ({
    headers: new Headers({ Authorization: "Bearer test-only" }), nextUrl: new URL(`https://app.example/api/cron/attendance-absent${query}`),
  });
  let result = await route.GET(request("?dryRun=true"));
  let data = await result.json();
  assert.equal(data.created, 0);
  assert.equal(data.eligibleToCreate, 2);
  assert.equal(events.length, 0);
  result = await route.GET(request());
  data = await result.json();
  assert.equal(data.created, 2);
  assert.deepEqual(Array.from(events[0].data, (a) => a.userId), ["regular", "leave"]);
  assert.deepEqual(Array.from(events[0].data, (a) => a.status), ["Absent", "Cuti"]);
  assert.equal(events[0].skipDuplicates, true);
  existing = events[0].data.map((a) => ({ ...a, id: a.userId }));
  result = await route.GET(request());
  assert.equal((await result.json()).created, 0);
  assert.equal(events.length, 1);
  assert.equal((await route.GET(request("?date=2026-11-09"))).status, 400);
  const unauthenticated = request();
  unauthenticated.headers = new Headers();
  assert.equal((await route.GET(unauthenticated)).status, 401);
});

test("backup cron batches records, makes no writes in dry-run, and reports partial failure", async () => {
  let reads = 0;
  let writes = 0;
  const route = load("app/api/cron/attendance-backup/route.ts", {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/lib/prisma": { attendance: { findMany: async () => reads++ % 2 === 0 ? [row] : [] } },
    "@/lib/helper/attendance-backup": {
      requireAttendanceBackupBucket: async () => "private",
      backupAttendance: async () => { writes++; throw new Error("Missing image"); },
    },
  }, { CRON_SECRET: "test-only" });
  const req = (query) => ({ headers: new Headers({ Authorization: "Bearer test-only" }), nextUrl: new URL(`https://app.example?date=2026-01-01&${query}`) });
  const dry = await route.GET(req("dryRun=true"));
  assert.equal(dry.status, 200);
  assert.equal((await dry.json()).checked, 1);
  assert.equal(writes, 0);
  const failed = await route.GET(req(""));
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).failed, 1);
  assert.equal(writes, 1);
});

test("recovery defaults to preview, preserves archives, and refuses conflicting records", async () => {
  const events = [];
  let conflict = false;
  const key = "tenant/branch/date/attendance/run/snapshot.json";
  const snapshot = { version: 1, attendance: row,
    evidence: [{ field: "checkInFaceImage", objectName: key.replace("snapshot.json", "checkInFaceImage") }] };
  const db = {
    user: { findFirst: async () => ({ id: "employee" }) },
    attendance: {
      findFirst: async () => conflict ? { id: "existing" } : null,
      create: async (args) => { events.push({ action: "create", row: args.data }); },
    },
    $disconnect: async () => {},
  };
  const storage = {
    getObject: async () => (async function* () { yield Buffer.from(JSON.stringify(snapshot)); })(),
    statObject: async () => ({}), copyObject: async () => events.push({ action: "copy" }),
  };
  const mocks = {
    "dotenv/config": {},
    "@prisma/client": { PrismaClient: class { constructor() { return db; } }, Prisma: { DbNull: null } },
    "@prisma/adapter-pg": { PrismaPg: class {} },
    pg: { Pool: class { async end() {} } },
    minio: { Client: class { constructor() { return storage; } },
      CopySourceOptions: class {}, CopyDestinationOptions: class {} },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "restore-attendance-backup.mjs"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction("require", "exports", "process", "Buffer", "console", code);
  const invoke = (args = []) => run((name) => name in mocks ? mocks[name] : require(name), {}, {
    env: { MINIO_BUCKET_ATTENDANCE_BACKUPS: "private", MINIO_BUCKET_AVATARS: "photos" },
    argv: ["node", "restore", key, ...args],
  }, Buffer, { log() {}, info() {} });
  await invoke();
  assert.equal(events.length, 0);
  conflict = true;
  await assert.rejects(() => invoke(["--apply"]), /sudah ada/);
  assert.equal(events.length, 0);
  conflict = false;
  await invoke(["--apply"]);
  assert.deepEqual(events.map((e) => e.action), ["copy", "create"]);
  assert.ok(events[1].row.checkInFaceImage.includes("attendance-restored/"));
  assert.equal(events[1].row.attendanceDay.toISOString(), row.attendanceDay.toISOString());
});
