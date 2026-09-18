import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth/session";
import { getAttendanceOvertime } from "@/lib/helper/attendance-overtime";
import { getOvertimeApproverIds } from "@/lib/helper/overtime-approvers";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { validateAttachmentBuffer } from "@/lib/security/file-validation";
import { BUCKET_AVATARS, uploadBufferToMinio, deleteFromMinio } from "@/lib/minio";
import { randomUUID } from "node:crypto";
import { splitOvertimePeriods } from "@/lib/helper/overtime-periods";
import { getJakartaDayRange } from "@/lib/helper/date";

export async function requestOvertimeFromAttendance(req: Request, user: SessionUser) {
  const form = await req.formData();
  const attendanceId = String(form.get("attendanceId") || "");
  const description = String(form.get("description") || "").trim();
  const file = form.get("file");
  if (!attendanceId || !description || !(file instanceof File) || !file.size) {
    return NextResponse.json({ message: "Keterangan dan bukti lembur wajib diisi" }, { status: 400 });
  }
  if (description.length > 2000) return NextResponse.json({ message: "Keterangan maksimal 2000 karakter" }, { status: 400 });
  if (file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
    return NextResponse.json({ message: "Bukti harus JPG, PNG, atau PDF maksimal 3 MB" }, { status: 400 });
  }
  const attendance = await prisma.attendance.findFirst({
    where: { id: attendanceId, userId: user.id, tenantId: user.tenantId },
  });
  if (!attendance) return NextResponse.json({ message: "Kehadiran tidak ditemukan" }, { status: 404 });
  const config = await prisma.attendanceConfig.findFirst({ where: { tenantId: attendance.tenantId }, orderBy: { updatedAt: "desc" } });
  const candidate = getAttendanceOvertime(attendance, config?.overtimeThresholdHours ?? 2);
  if (!candidate) return NextResponse.json({ message: "Kehadiran belum memenuhi minimal lembur" }, { status: 409 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateAttachmentBuffer(file.name, file.type, buffer);
  if (!validation.ok) return NextResponse.json({ message: validation.message }, { status: 415 });
  if (!["image/jpeg", "image/png", "application/pdf"].includes(validation.contentType)) {
    return NextResponse.json({ message: "Bukti harus JPG, PNG, atau PDF" }, { status: 415 });
  }
  const approverIds = await getOvertimeApproverIds(prisma, attendance.tenantId);
  if (!approverIds.length) return NextResponse.json({ message: "Belum ada approver lembur yang dikonfigurasi. Hubungi admin." }, { status: 400 });
  const objectName = await buildTenantStorageObjectName(attendance.tenantId, "overtime-proofs", `proof-${randomUUID()}-${file.name.replace(/\s+/g, "_")}`);
  const proofUrl = await uploadBufferToMinio(buffer, objectName, BUCKET_AVATARS, validation.contentType);
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attendance-overtime:${attendance.id}`}))`;
      const linked = await tx.overtime.findFirst({ where: { attendanceId }, orderBy: { startTime: "asc" } });
      if (linked) return { data: linked, created: false };
      const current = await tx.attendance.findFirst({ where: { id: attendanceId, userId: user.id, tenantId: user.tenantId } });
      const verified = current && getAttendanceOvertime(current, config?.overtimeThresholdHours ?? 2);
      if (!current || !verified) throw new Error("Kehadiran berubah. Muat ulang halaman dan coba lagi.");
      const periods = splitOvertimePeriods(new Date(verified.startTime), new Date(verified.endTime));
      const duplicate = await tx.overtime.findFirst({ where: {
        userId: user.id, tenantId: current.tenantId, status: { not: "REJECTED" },
        OR: [
          ...periods.map((period) => {
            const { startUtc, endUtc } = getJakartaDayRange(period.startTime);
            return { overtimeDate: { gte: startUtc, lte: endUtc } };
          }),
          { startTime: { lt: new Date(verified.endTime) }, endTime: { gt: new Date(verified.startTime) } },
        ],
      } });
      if (duplicate) throw new Error("Sudah ada pengajuan lembur pada tanggal ini. Lanjutkan pengajuan tersebut melalui menu Lembur.");
      const records = [];
      for (const period of periods) {
        const data = await tx.overtime.create({ data: {
          tenantId: current.tenantId, userId: user.id, attendanceId,
          ...period,
          description, proofUrl, status: "PENDING",
          checkOutFaceImage: current.checkOutFaceImage,
          checkOutLocation: current.checkOutLocation as Prisma.InputJsonValue,
          payMethod: "PER_HOUR", hourlyRate: 0, dailyRate: 0, payoutAmount: 0,
          approvalDecisions: { createMany: { data: approverIds.map((approverUserId) => ({ approverUserId, status: "PENDING" })) } },
        } });
        records.push(data);
      }
      return { data: records[0], created: true };
    });
    if (!result.created) await deleteFromMinio(proofUrl).catch(() => {});
    return NextResponse.json({ message: result.created ? "Pengajuan lembur berhasil dibuat dan menunggu persetujuan" : "Pengajuan lembur sudah tercatat", data: result.data }, { status: result.created ? 201 : 200 });
  } catch (error) {
    await deleteFromMinio(proofUrl).catch(() => {});
    return NextResponse.json({ message: error instanceof Error ? error.message : "Gagal membuat lembur" }, { status: 409 });
  }
}
