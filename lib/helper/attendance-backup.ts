import { randomUUID } from "node:crypto";
import type { Attendance } from "@prisma/client";
import { CopyDestinationOptions, CopySourceOptions } from "minio";
import minioClient, { BUCKET_AVATARS } from "@/lib/minio";

export class AttendanceBackupError extends Error {}

type BackupContext = {
  action: "scheduled" | "before-update" | "before-delete";
  actorUserId?: string;
  actorRole?: string;
  ipAddress?: string;
  changes?: unknown;
};

export async function requireAttendanceBackupBucket() {
  const bucket = process.env.MINIO_BUCKET_ATTENDANCE_BACKUPS;
  if (!bucket || bucket === BUCKET_AVATARS) {
    throw new AttendanceBackupError("Bucket backup absensi privat belum dikonfigurasi");
  }
  try {
    if (!await minioClient.bucketExists(bucket)) throw new Error("Backup bucket missing");
    // Refuse buckets with anonymous access. Backups contain photos and personal data.
    try {
      const policy = JSON.parse(await minioClient.getBucketPolicy(bucket));
      const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
      if (statements.some((s: { Effect?: string; Principal?: unknown }) =>
        s?.Effect === "Allow" && String(JSON.stringify(s.Principal)).includes('"*"'))) {
        throw new Error("Backup bucket allows anonymous access");
      }
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "NoSuchBucketPolicy")) throw error;
    }
    return bucket;
  } catch (error) {
    console.error("ATTENDANCE BACKUP STORAGE ERROR", error);
    throw new AttendanceBackupError("Penyimpanan backup absensi tidak tersedia atau tidak privat. Data tidak diubah.");
  }
}

export async function backupAttendance(attendance: Attendance, context: BackupContext, bucket?: string) {
  try {
    const targetBucket = bucket ?? await requireAttendanceBackupBucket();
    const day = attendance.attendanceDay.toISOString().slice(0, 10);
    const prefix = `${attendance.tenantId ?? "shared"}/${attendance.branchId ?? "no-branch"}/${day}/${attendance.id}/${randomUUID()}`;
    const evidence: { field: string; originalUrl: string; objectName: string }[] = [];
    for (const field of ["checkInFaceImage", "checkOutFaceImage"] as const) {
      const url = attendance[field];
      if (!url) continue;
      const parsed = new URL(url);
      const [sourceBucket, ...parts] = parsed.pathname.replace(/^\//, "").split("/");
      if (sourceBucket !== BUCKET_AVATARS || !parts.length) throw new Error("Unsupported attendance evidence location");
      const sourceObject = decodeURIComponent(parts.join("/"));
      const objectName = `${prefix}/${field}`;
      // Server-side copy only; never fetch arbitrary URLs from stored data.
      await minioClient.copyObject(
        new CopySourceOptions({ Bucket: sourceBucket, Object: sourceObject }),
        new CopyDestinationOptions({ Bucket: targetBucket, Object: objectName }),
      );
      evidence.push({ field, originalUrl: url, objectName });
    }
    const objectName = `${prefix}/snapshot.json`;
    const payload = Buffer.from(JSON.stringify({
      version: 1, capturedAt: new Date().toISOString(), phase: context.action === "scheduled" ? "snapshot" : "before-mutation",
      context, attendance, evidence,
    }));
    await minioClient.putObject(targetBucket, objectName, payload, payload.length, {
      "Content-Type": "application/json", "Cache-Control": "private, no-store",
    });
    return { bucket: targetBucket, objectName };
  } catch (error) {
    if (error instanceof AttendanceBackupError) throw error;
    console.error("ATTENDANCE BACKUP ERROR", error);
    throw new AttendanceBackupError("Backup data atau foto absensi gagal. Data tidak diubah.");
  }
}
