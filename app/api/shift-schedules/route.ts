export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { getJakartaDayKey } from "@/lib/helper/date";

function parseWorkDate(value: string) {
  return getJakartaDayKey(new Date(`${value}T12:00:00+07:00`));
}

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "shift-schedules", "get-all");
  if (forbid) return forbid;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.max(1, Number(searchParams.get("limit") || 10));
  const branchId = searchParams.get("branchId") || "";
  const shiftId = searchParams.get("shiftId") || "";
  const search = searchParams.get("search") || "";
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const activeEmployeesOnly = searchParams.get("activeEmployeesOnly") === "true";
  const scopedTenantId = ensureTenantScope(auth.user);
  const where: Prisma.EmployeeShiftScheduleWhereInput = {
    ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(shiftId === "DAY_OFF" ? { isDayOff: true } : shiftId ? { shiftId } : {}),
    ...(activeEmployeesOnly ? { user: { status: "active" } } : {}),
    ...(search ? { user: { ...(activeEmployeesOnly ? { status: "active" } : {}), OR: [{ name: { contains: search, mode: "insensitive" } }, { nik: { contains: search, mode: "insensitive" } }] } } : {}),
    ...(startDate || endDate ? { workDate: { ...(startDate ? { gte: parseWorkDate(startDate) } : {}), ...(endDate ? { lte: parseWorkDate(endDate) } : {}) } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.employeeShiftSchedule.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ workDate: "desc" }, { user: { name: "asc" } }],
      select: {
        id: true,
        branchId: true,
        userId: true,
        shiftId: true,
        isDayOff: true,
        workDate: true,
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, nik: true, position: true } },
        shift: {
          select: {
            id: true,
            branchId: true,
            name: true,
            startTime: true,
            endTime: true,
            crossesMidnight: true,
          },
        },
      },
    }),
    prisma.employeeShiftSchedule.count({ where }),
  ]);
  return NextResponse.json({ data, total, page, limit });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "shift-schedules", "update");
  if (forbid) return forbid;
  const body = await req.json();
  const scopedTenantId = ensureTenantScope(auth.user);

  if (body.action === "COPY_WEEK") {
    const branchId = String(body.branchId || "");
    const sourceStartDate = String(body.sourceStartDate || "");
    const targetStartDate = String(body.targetStartDate || "");
    const branch = await prisma.branch.findFirst({ where: { id: branchId, scheduleType: "SHIFT", ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) } });
    if (!branch || !sourceStartDate || !targetStartDate) return NextResponse.json({ message: "Cabang dan minggu sumber/tujuan wajib dipilih" }, { status: 400 });
    const sourceStart = parseWorkDate(sourceStartDate);
    const sourceEnd = new Date(sourceStart); sourceEnd.setUTCDate(sourceEnd.getUTCDate() + 6);
    const targetStart = parseWorkDate(targetStartDate);
    const sourceRows = await prisma.employeeShiftSchedule.findMany({ where: { branchId, workDate: { gte: sourceStart, lte: sourceEnd } } });
    await prisma.$transaction(sourceRows.map((row) => {
      const dayOffset = Math.round((row.workDate.getTime() - sourceStart.getTime()) / 86400000);
      const workDate = new Date(targetStart); workDate.setUTCDate(workDate.getUTCDate() + dayOffset);
      return prisma.employeeShiftSchedule.upsert({ where: { userId_workDate: { userId: row.userId, workDate } }, create: { tenantId: branch.tenantId, branchId, userId: row.userId, shiftId: row.shiftId, isDayOff: row.isDayOff, workDate }, update: { branchId, shiftId: row.shiftId, isDayOff: row.isDayOff, tenantId: branch.tenantId } });
    }));
    return NextResponse.json({ message: `${sourceRows.length} jadwal berhasil disalin` });
  }

  const branchId = String(body.branchId || "");
  const shiftId = body.shiftId ? String(body.shiftId) : null;
  const isDayOff = Boolean(body.isDayOff);
  const userIds: string[] = Array.isArray(body.userIds) ? [...new Set<string>(body.userIds.map((value: unknown) => String(value)))] : [];
  const dates: string[] = Array.isArray(body.dates) ? [...new Set<string>(body.dates.map((value: unknown) => String(value)))] : [];
  if (!branchId || (!shiftId && !isDayOff) || userIds.length === 0 || dates.length === 0) return NextResponse.json({ message: "Cabang, jadwal, karyawan, dan tanggal wajib diisi" }, { status: 400 });
  const branch = await prisma.branch.findFirst({ where: { id: branchId, scheduleType: "SHIFT", ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) } });
  if (!branch) return NextResponse.json({ message: "Cabang shifting tidak ditemukan" }, { status: 404 });
  const [shift, users] = await Promise.all([
    shiftId ? prisma.workShift.findFirst({ where: { id: shiftId, branchId, tenantId: branch.tenantId, isActive: true } }) : Promise.resolve(null),
    prisma.user.findMany({ where: { id: { in: userIds }, branchId, tenantId: branch.tenantId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!isDayOff && !shift) return NextResponse.json({ message: "Shift aktif tidak ditemukan di cabang" }, { status: 400 });
  if (users.length !== userIds.length) return NextResponse.json({ message: "Ada karyawan yang tidak terdaftar pada cabang" }, { status: 400 });
  const workDates = dates.map(parseWorkDate);
  await prisma.$transaction(users.flatMap((user) => workDates.map((workDate) => prisma.employeeShiftSchedule.upsert({ where: { userId_workDate: { userId: user.id, workDate } }, create: { tenantId: branch.tenantId, branchId, userId: user.id, shiftId: isDayOff ? null : shiftId, isDayOff, workDate }, update: { branchId, shiftId: isDayOff ? null : shiftId, isDayOff, tenantId: branch.tenantId } }))));
  return NextResponse.json({ message: "Jadwal karyawan berhasil disimpan" });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "shift-schedules", "delete");
  if (forbid) return forbid;
  const ids = (new URL(req.url).searchParams.get("ids") || "").split(",").filter(Boolean);
  const scopedTenantId = ensureTenantScope(auth.user);
  if (ids.length === 0) return NextResponse.json({ message: "Jadwal wajib dipilih" }, { status: 400 });
  const result = await prisma.employeeShiftSchedule.deleteMany({ where: { id: { in: ids }, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) } });
  return NextResponse.json({ message: `${result.count} jadwal dihapus` });
}
