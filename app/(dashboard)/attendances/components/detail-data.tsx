import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Timer, BadgeCheck, Calendar } from "lucide-react";
import { AttendanceDto } from "@/lib/dto/attendance";

export default function DetailData({
  initialData,
  onClose,
}: {
  initialData: AttendanceDto;
  onClose: () => void;
}) {
  const statusLabel: Record<string, string> = {
    "On Time": "Tepat Waktu",
    Present: "Hadir",
    Lembur: "Lembur",
    Late: "Terlambat",
    "Late - Present": "Telat - Hadir",
    "Late - Half Day": "Telat - Setengah Hari",
    Absent: "Tidak Hadir",
    "Half Day": "Setengah Hari",
  };

  const isOvertimeAttendance =
    initialData.status === "Lembur" ||
    initialData.notes?.toLowerCase().includes("from overtime");

  const cardDetail = (
    title: string,
    duration: string,
    context: string,
    checkIn: string | null,
    checkOut: string | null,
    checkInFaceImage: string | null,
    checkOutFaceImage: string | null,
    checkInLocation: { latitude: number; longitude: number } | null,
    checkOutLocation: { latitude: number; longitude: number } | null
  ) => {
    return (
      <div className="mt-5 rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Timer className="h-4 w-4 text-amber-600" />
            {title}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Durasi {title}: {duration || "-"}
            </span>
          </div>
        </div>

        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-slate-50 p-6 dark:border dark:border-gray-700 dark:bg-gray-800 dark:text-slate-100">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {context} In
            </div>
            <div className="my-1 font-semibold text-slate-900 dark:text-slate-100">
              {checkIn
                ? new Date(checkIn).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
                : "-"}
            </div>
            {checkInFaceImage && (
              <a
                href={checkInFaceImage}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <img
                  src={checkInFaceImage}
                  alt="Bukti check in"
                  className="h-28 w-28 rounded-2xl object-cover shadow-sm transition-transform group-hover:scale-[1.02]"
                />
              </a>
            )}
            {checkInLocation && (
              <div className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-1.5 font-medium">
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  Lokasi
                </div>
                <a
                  href={`https://www.google.com/maps?q=${checkInLocation.latitude},${checkInLocation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                >
                  Lihat di Google Maps
                </a>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-slate-50 p-6 dark:border dark:border-gray-700 dark:bg-gray-800 dark:text-slate-100">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {context} Out
            </div>
            <div className="my-1 font-semibold text-slate-900 dark:text-slate-100">
              {checkOut
                ? new Date(checkOut).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
                : "-"}
            </div>
            {checkOutFaceImage && (
              <a
                href={checkOutFaceImage}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <img
                  src={checkOutFaceImage}
                  alt="Bukti check out"
                  className="h-28 w-28 rounded-2xl object-cover shadow-sm transition-transform group-hover:scale-[1.02]"
                />
              </a>
            )}
            {checkOutLocation && (
              <div className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-1.5 font-medium">
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  Lokasi
                </div>
                <a
                  href={`https://www.google.com/maps?q=${checkOutLocation.latitude},${checkOutLocation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                >
                  Lihat di Google Maps
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl overflow-hidden p-0 bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-800">
        <div className="flex items-center justify-between pt-4 px-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Detail Kehadiran
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 pb-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Calendar className="h-4 w-4" />
                Tanggal
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {new Date(initialData.date).toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <BadgeCheck className="h-4 w-4" />
                Status
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {statusLabel[initialData.status] || initialData.status}
              </div>
            </div>
          </div>

          {isOvertimeAttendance ? (
            <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300">
              Attendance ini berasal dari integrasi lembur.
            </div>
          ) : null}

          {cardDetail(
            "Riwayat Kehadiran",
            initialData.workHours === "0" ? "-" : initialData.workHours,
            "Check",
            initialData.checkIn || null,
            initialData.checkOut || null,
            initialData.checkInFaceImage || null,
            initialData.checkOutFaceImage || null,
            initialData.checkInLocation || null,
            initialData.checkOutLocation || null
          )}

          {initialData.breakSessions?.length ? (
            <>
              {initialData.breakSessions.map((session, index) => (
                <div key={index}>
                  {cardDetail(
                    "Riwayat Istirahat/Break",
                    session.duration || "-",
                    "Istirahat/Break",
                    session.breakIn || null,
                    session.breakOut || null,
                    session.breakInFaceImage || null,
                    session.breakOutFaceImage || null,
                    session.breakInLocation || null,
                    session.breakOutLocation || null
                  )}
                </div>
              ))}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
