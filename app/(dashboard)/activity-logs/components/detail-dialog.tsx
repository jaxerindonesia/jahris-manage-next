"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActivityLogDto } from "@/lib/dto/activity-log";
import { formatDateId, formatTimeId } from "@/lib/helper/date";
import { getActivityActionLabel, getActivityModuleLabel } from "../page.config";

interface DetailDialogProps {
  log: ActivityLogDto | null;
  onClose: () => void;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="break-words text-sm font-medium text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

export default function DetailDialog({ log, onClose }: DetailDialogProps) {
  const metadata = log?.metadata ?? null;
  const changes = Object.entries(metadata?.changes ?? {});
  const extraMetadata = metadata
    ? Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "changes"))
    : {};

  return (
    <Dialog open={!!log} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Detail Log Aktivitas</DialogTitle>
          <DialogDescription>{log?.message || "-"}</DialogDescription>
        </DialogHeader>

        {log && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 rounded-lg border bg-gray-50 p-4 sm:grid-cols-3 dark:border-gray-700 dark:bg-gray-800/50">
              <InfoRow label="Waktu" value={`${formatDateId(log.createdAt)} ${formatTimeId(log.createdAt)}`} />
              <InfoRow label="Pelaku" value={`${log.actorName || "Sistem"} (${log.actorRole || "-"})`} />
              <InfoRow label="Aksi" value={`${getActivityModuleLabel(log.action)} - ${getActivityActionLabel(log.action)}`} />
              <InfoRow label="Status" value={log.status} />
              <InfoRow label="IP Address" value={log.ipAddress || "-"} />
              <InfoRow label="Endpoint" value={log.method && log.path ? `${log.method} ${log.path}` : "-"} />
            </div>

            {changes.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Perubahan</h4>
                <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Sebelum</TableHead>
                        <TableHead>Sesudah</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {changes.map(([field, change]) => (
                        <TableRow key={field}>
                          <TableCell className="font-medium">{field}</TableCell>
                          <TableCell className="whitespace-normal break-all text-red-600 dark:text-red-400">{formatValue(change.from)}</TableCell>
                          <TableCell className="whitespace-normal break-all text-green-600 dark:text-green-400">{formatValue(change.to)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {Object.keys(extraMetadata).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Data</h4>
                <pre className="max-h-80 overflow-auto rounded-lg border bg-gray-50 p-3 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200">
                  {JSON.stringify(extraMetadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
