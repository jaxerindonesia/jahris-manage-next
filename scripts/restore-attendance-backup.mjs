import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client, CopyDestinationOptions, CopySourceOptions } from "minio";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const objectName = process.argv[2];
const apply = process.argv.includes("--apply");
const bucket = process.env.MINIO_BUCKET_ATTENDANCE_BACKUPS;
const sourceBucket = process.env.MINIO_BUCKET_AVATARS || "hr-manage-system";
if (!bucket || bucket === sourceBucket || !objectName?.endsWith("/snapshot.json")) {
  throw new Error("Gunakan: node scripts/restore-attendance-backup.mjs <object-key/snapshot.json> [--apply]");
}
const storage = new Client({
  endPoint: process.env.MINIO_ENDPOINT, port: Number(process.env.MINIO_PORT || 1608),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY, secretKey: process.env.MINIO_SECRET_KEY,
});
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });
try {
  const stream = await storage.getObject(bucket, objectName);
  const buffers = [];
  for await (const buffer of stream) buffers.push(buffer);
  const snapshot = JSON.parse(Buffer.concat(buffers).toString("utf8"));
  if (snapshot.version !== 1 || !snapshot.attendance?.id || !Array.isArray(snapshot.evidence)) {
    throw new Error("Format snapshot tidak valid");
  }
  const row = snapshot.attendance;
  const user = await db.user.findFirst({ where: { id: row.userId, tenantId: row.tenantId }, select: { id: true } });
  if (!user) throw new Error("Karyawan tidak ditemukan pada tenant snapshot");
  const existing = await db.attendance.findFirst({
    where: { OR: [{ id: row.id }, { userId: row.userId, attendanceDay: new Date(row.attendanceDay) }] }, select: { id: true },
  });
  if (existing) throw new Error("Absensi sudah ada pada tanggal ini. Pemulihan tidak menimpa data; tinjau manual dahulu.");
  for (const evidence of snapshot.evidence) {
    if (!["checkInFaceImage", "checkOutFaceImage"].includes(evidence.field) ||
      !evidence.objectName.startsWith(objectName.slice(0, -"snapshot.json".length))) {
      throw new Error("Referensi foto snapshot tidak valid");
    }
    await storage.statObject(bucket, evidence.objectName);
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", attendanceId: row.id, tenantId: row.tenantId,
    attendanceDay: row.attendanceDay, evidenceCount: snapshot.evidence.length }));
  if (apply) {
    const publicUrl = (process.env.MINIO_PUBLIC_URL || "https://s3.jahris.id").replace(/\/$/, "");
    for (const evidence of snapshot.evidence) {
      const key = `${row.tenantId ?? "shared"}/attendance-restored/${randomUUID()}-${evidence.field}`;
      await storage.copyObject(
        new CopySourceOptions({ Bucket: bucket, Object: evidence.objectName }),
        new CopyDestinationOptions({ Bucket: sourceBucket, Object: key }),
      );
      row[evidence.field] = `${publicUrl}/${sourceBucket}/${key}`;
    }
    for (const field of ["date", "attendanceDay", "checkIn", "checkOut", "scheduledStartAt", "scheduledEndAt", "createdAt", "updatedAt"]) {
      if (row[field]) row[field] = new Date(row[field]);
    }
    for (const field of ["breakSessions", "checkInLocation", "checkOutLocation"]) {
      if (row[field] === null) row[field] = Prisma.DbNull;
    }
    await db.attendance.create({ data: row });
    console.info(JSON.stringify({ action: "attendances.restore", attendanceId: row.id, snapshot: objectName, restoredAt: new Date().toISOString() }));
  }
} finally {
  await db.$disconnect();
  await pool.end();
}
