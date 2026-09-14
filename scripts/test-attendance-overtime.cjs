/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node integration test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { prisma, pool } = require('./sync-reimbursement-journals.cjs');

function loadTs(filename, overrides = {}) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/')) return loadTs(path.resolve(`${name.slice(2)}.ts`), overrides);
    if (name.startsWith('.')) return loadTs(path.resolve(path.dirname(filename), `${name}.ts`), overrides);
    return require(name);
  };
  new Function('require', 'module', 'exports', output)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

async function main() {
  const { getAttendanceOvertime } = loadTs(path.resolve('lib/helper/attendance-overtime.ts'));
  const attendance = {
    id: randomUUID(), checkIn: new Date('2040-09-14T08:00:00+07:00'),
    scheduledEndAt: new Date('2040-09-14T17:00:00+07:00'),
    checkOut: new Date('2040-09-14T19:00:00+07:00'), autoCheckout: false,
  };
  assert.equal(getAttendanceOvertime(attendance, 2).overtimeMinutes, 120);
  assert.equal(getAttendanceOvertime({ ...attendance, checkOut: new Date('2040-09-14T18:59:59+07:00') }, 2), null);
  assert.equal(getAttendanceOvertime(attendance, 0), null);
  assert.equal(getAttendanceOvertime({ ...attendance, autoCheckout: true }, 2), null);
  assert.equal(getAttendanceOvertime({ ...attendance, scheduledEndAt: null }, 2), null);
  assert.equal(getAttendanceOvertime({ ...attendance, checkIn: new Date('2040-09-14T18:00:00+07:00') }, 2), null);
  assert.equal(getAttendanceOvertime({ ...attendance, scheduledEndAt: new Date('2040-09-15T06:00:00+07:00'), checkOut: new Date('2040-09-15T08:00:00+07:00') }, 2).overtimeMinutes, 120);
  const user = await prisma.user.findFirst({ where: { tenantId: { not: null }, deletedAt: null, role: { name: 'Admin' } }, select: { id: true, tenantId: true } });
  assert.ok(user, 'An existing tenant admin is required for rollback integration tests');
  const rollback = new Error('ROLLBACK_TEST');
  try {
    await prisma.$transaction(async (tx) => {
      await tx.attendanceConfig.create({ data: { tenantId: user.tenantId, officeStartTime: '08:00', officeEndTime: '17:00', lateToleranceMinutes: 15, overtimeThresholdHours: 2 } });
      await tx.attendance.create({ data: { ...attendance, userId: user.id, tenantId: user.tenantId, date: attendance.checkIn, attendanceDay: new Date('2040-09-14T00:00:00Z'), status: 'Present', checkOutLocation: { latitude: -6, longitude: 106 }, checkOutFaceImage: 'https://example.test/attendance-face.png' } });
      let uploads = 0;
      let deletes = 0;
      const service = loadTs(path.resolve('app/api/overtimes/request/from-attendance.ts'), {
        '@/lib/prisma': { __esModule: true, default: new Proxy(tx, { get(target, key) { return key === '$transaction' ? (fn) => fn(tx) : target[key]; } }) },
        '@/lib/helper/storage': { buildTenantStorageObjectName: async () => 'test-proof.png' },
        '@/lib/minio': { BUCKET_AVATARS: 'test', uploadBufferToMinio: async () => { uploads++; return 'https://example.test/test-proof.png'; }, deleteFromMinio: async () => { deletes++; } },
      });
      const request = (withFile = true) => {
        const form = new FormData();
        form.set('attendanceId', attendance.id);
        form.set('description', 'Menyelesaikan laporan');
        if (withFile) form.set('file', new File([Buffer.from([137,80,78,71,13,10,26,10])], 'proof.png', { type: 'image/png' }));
        return new Request('http://localhost/api/overtimes/request', { method: 'POST', body: form });
      };
      let response = await service.requestOvertimeFromAttendance(request(false), user);
      assert.equal(response.status, 400);
      response = await service.requestOvertimeFromAttendance(request(), { ...user, id: randomUUID() });
      assert.equal(response.status, 404);
      response = await service.requestOvertimeFromAttendance(request(), { ...user, tenantId: randomUUID() });
      assert.equal(response.status, 404);
      assert.equal(uploads, 0);
      response = await service.requestOvertimeFromAttendance(request(), user);
      const result = await response.json();
      assert.equal(response.status, 201, result.message);
      assert.equal(result.data.status, 'PENDING');
      assert.equal(result.data.overtimeMinutes, 120);
      assert.equal(result.data.attendanceId, attendance.id);
      assert.equal(result.data.tenantId, user.tenantId);
      assert.equal(result.data.startTime, attendance.scheduledEndAt.toISOString());
      assert.ok(await tx.overtimeApprovalDecision.count({ where: { overtimeId: result.data.id } }));
      response = await service.requestOvertimeFromAttendance(request(), user);
      assert.equal(response.status, 200);
      assert.equal(await tx.overtime.count({ where: { attendanceId: attendance.id } }), 1);
      assert.equal(deletes, 1, 'Unused retry upload must be cleaned up');
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await prisma.attendance.count({ where: { id: attendance.id } }), 0);
  console.log('PASS: threshold boundary, disabled setting, auto checkout, missing schedule, late start, overnight shift, required proof, ownership/tenant checks, PENDING creation, approvers, idempotent retry. Database test writes rolled back; MinIO stubbed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
