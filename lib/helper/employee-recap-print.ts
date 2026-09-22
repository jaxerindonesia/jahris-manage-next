import type { EmployeeRecapDto } from "@/lib/dto/employee-recap";
import type { UserDto } from "@/lib/dto/user";
import { formatDateId, formatTimeId } from "@/lib/helper/date";

export const EMPLOYEE_RECAP_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export type EmployeeRecapPrintItem = {
  employee: UserDto;
  recap: EmployeeRecapDto;
  brand?: { companyName?: string | null; logoUrl?: string | null };
};

function escapeHtml(value: unknown) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getEmployeeSubmissionStatusLabel(status: string) {
  const normalizedStatus = status?.toUpperCase() || "";
  if (normalizedStatus === "APPROVED") return "Disetujui";
  if (normalizedStatus === "REJECTED") return "Ditolak";
  return "Pending";
}

function getAttendanceStatusClass(status: string) {
  const normalizedStatus = status?.toLowerCase() || "";
  if (["hadir", "present", "tepat waktu"].some((value) => normalizedStatus.includes(value))) {
    return "status-success";
  }
  if (["telat", "late", "terlambat"].some((value) => normalizedStatus.includes(value))) {
    return "status-warning";
  }
  if (["alpha", "absent", "tidak hadir"].some((value) => normalizedStatus.includes(value))) {
    return "status-danger";
  }
  if (["izin", "cuti", "sakit", "leave", "sick"].some((value) => normalizedStatus.includes(value))) {
    return "status-info";
  }
  return "status-neutral";
}

function getSubmissionStatusClass(status: string) {
  const normalizedStatus = status?.toUpperCase() || "";
  if (normalizedStatus === "APPROVED") return "status-success";
  if (normalizedStatus === "REJECTED") return "status-danger";
  return "status-warning";
}

function buildRecapPage({ employee, recap, brand }: EmployeeRecapPrintItem) {
  const summary = recap.attendance.summary;
  const periodLabel = recap.startDate && recap.endDate
    ? `${formatDateId(recap.startDate)} - ${formatDateId(recap.endDate)}`
    : `${EMPLOYEE_RECAP_MONTHS[recap.month - 1]} ${recap.year}`;
  const companyName = brand?.companyName || employee.tenant?.companyName || "PT Jaxer Grup Indonesia";
  const logoUrl = brand?.logoUrl || employee.tenant?.logoUrl;
  const branchName = employee.branch?.name || "-";
  const gender = employee.gender === "male" ? "Laki-laki" : employee.gender === "female" ? "Perempuan" : "-";
  const printedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const attendanceRows = recap.attendance.details.map((attendance) => `
    <tr><td>${escapeHtml(formatDateId(attendance.date))}</td><td>${escapeHtml(formatTimeId(attendance.checkIn))}</td><td>${escapeHtml(formatTimeId(attendance.checkOut))}</td><td><span class="status ${getAttendanceStatusClass(attendance.status)}">${escapeHtml(attendance.status || "-")}</span></td><td>${escapeHtml(attendance.workHours || "-")}</td><td>${escapeHtml(attendance.notes || "-")}</td></tr>
  `).join("");
  const quotaCards = recap.submissions.leaveQuotas.map((quota) => `
    <div class="quota-card"><p class="quota-title">${escapeHtml(quota.configName)}</p><p class="quota-value">${escapeHtml(quota.remainingDays)} <span>/ ${escapeHtml(quota.maxDays)} hari</span></p><p class="quota-used">Terpakai ${escapeHtml(quota.usedDays)} hari</p></div>
  `).join("");
  const submissionRows = recap.submissions.history.map((submission) => `
    <tr><td>${escapeHtml(submission.type)}</td><td>${escapeHtml(formatDateId(submission.startDate))}</td><td>${escapeHtml(formatDateId(submission.endDate))}</td><td>${escapeHtml(submission.reason || "-")}</td><td><span class="status ${getSubmissionStatusClass(submission.status)}">${escapeHtml(getEmployeeSubmissionStatusLabel(submission.status))}</span></td><td>${escapeHtml(formatDateId(submission.createdAt))}</td></tr>
  `).join("");

  return `<section class="employee-recap-page">
    <header class="document-header"><div class="brand">${logoUrl ? `<img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="Logo ${escapeHtml(companyName)}" />` : '<div class="brand-mark">HR</div>'}<div><p class="brand-name">${escapeHtml(companyName)}</p><p class="brand-subtitle">Human Resource Management</p></div></div><div class="document-meta"><strong>REKAP KARYAWAN</strong><span>${escapeHtml(periodLabel)}</span></div></header>
    <div class="profile"><h1>${escapeHtml(employee.name)}</h1><div class="profile-subtitle">${escapeHtml(employee.position || "-")} &nbsp;·&nbsp; ${escapeHtml(employee.department?.name || "-")} &nbsp;·&nbsp; ${escapeHtml(branchName)}</div><div class="meta"><div class="meta-item"><span class="label">NIK</span><span class="value">${escapeHtml(employee.nik || "-")}</span></div><div class="meta-item"><span class="label">Email</span><span class="value">${escapeHtml(employee.email || "-")}</span></div><div class="meta-item"><span class="label">Gender</span><span class="value">${escapeHtml(gender)}</span></div><div class="meta-item"><span class="label">Tempat, Tanggal Lahir</span><span class="value">${escapeHtml(employee.birthPlace ? `${employee.birthPlace}, ` : "")}${escapeHtml(formatDateId(employee.birthDate))}</span></div><div class="meta-item"><span class="label">Cabang</span><span class="value">${escapeHtml(branchName)}</span></div><div class="meta-item address"><span class="label">Alamat</span><span class="value">${escapeHtml(employee.address || "-")}</span></div></div></div>
    <h2><span>Ringkasan Kehadiran</span><span>${escapeHtml(periodLabel)}</span></h2><div class="summary-cards"><div class="summary-card" style="--accent:#16a34a"><div class="label">Hadir</div><div class="num">${summary.totalHadir || 0}</div></div><div class="summary-card" style="--accent:#d97706"><div class="label">Telat</div><div class="num">${summary.totalTelat || 0}</div></div><div class="summary-card" style="--accent:#dc2626"><div class="label">Alpha</div><div class="num">${summary.totalAlpha || 0}</div></div><div class="summary-card" style="--accent:#2563eb"><div class="label">Izin / Cuti</div><div class="num">${summary.totalIzin || 0}</div></div></div>
    <table><thead><tr><th>Tanggal</th><th>Jam Masuk</th><th>Jam Keluar</th><th>Status</th><th>Jam Kerja</th><th>Catatan</th></tr></thead><tbody>${attendanceRows || '<tr><td colspan="6" class="empty">Tidak ada data kehadiran</td></tr>'}</tbody></table>
    <h2><span>Pengajuan Ketidakhadiran</span><span>${escapeHtml(periodLabel)}</span></h2>${quotaCards ? `<div class="quota-cards">${quotaCards}</div>` : '<p class="empty">Tidak ada kuota cuti.</p>'}<table><thead><tr><th>Jenis</th><th>Mulai</th><th>Selesai</th><th>Alasan</th><th>Status</th><th>Diajukan</th></tr></thead><tbody>${submissionRows || '<tr><td colspan="6" class="empty">Tidak ada pengajuan</td></tr>'}</tbody></table>
    <footer class="document-footer"><span>${escapeHtml(companyName)} · ${escapeHtml(branchName)}</span><span>Dicetak ${escapeHtml(printedAt)}</span></footer>
  </section>`;
}

const PRINT_STYLES = `<style>
  #employee-recap-print-container{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;padding:0;font-size:10px;line-height:1.45;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}#employee-recap-print-container *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}.employee-recap-page{break-after:page;page-break-after:always}.employee-recap-page:last-child{break-after:auto;page-break-after:auto}.document-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:12px;margin-bottom:16px;border-bottom:1.5px solid #0f172a}.brand{display:flex;align-items:center;gap:10px}.brand-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:800}.brand-logo{display:block;width:64px;height:32px;object-fit:contain;object-position:left center}.brand-name{margin:0;font-size:13px;font-weight:750}.brand-subtitle{margin:1px 0 0;color:#64748b;font-size:8px;letter-spacing:.1em;text-transform:uppercase}.document-meta{text-align:right}.document-meta strong{display:block;font-size:12px;letter-spacing:.04em}.document-meta span{color:#64748b;font-size:9px}h1{font-size:17px;line-height:1.2;margin:0 0 3px;letter-spacing:-.02em;font-weight:600}h2{display:flex;align-items:center;justify-content:space-between;font-size:10px;margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid #cbd5e1;color:#334155;letter-spacing:.08em;text-transform:uppercase}.profile{padding:0 0 14px;border-bottom:1px solid #e2e8f0}.profile-subtitle{color:#475569;font-size:10px}.meta{display:grid;grid-template-columns:.7fr 1.5fr .8fr 1.2fr;gap:8px 18px;margin-top:10px}.meta-item{display:flex;flex-direction:column;gap:2px}.meta-item.address{grid-column:2/-1}.label{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8}.value{font-weight:600;font-size:9.5px;color:#1e293b}.summary-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:10px}.summary-card{position:relative;padding:8px 10px;border:1px solid #e2e8f0;border-radius:7px;background:#fff}.summary-card:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;border-radius:7px 0 0 7px;background:var(--accent)}.summary-card .label{color:#64748b!important}.summary-card .num{font-size:18px;line-height:1;font-weight:750;margin-top:5px;color:#0f172a!important}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#f8fafc;color:#475569;text-align:left;padding:6px 7px;border-block:1px solid #cbd5e1;font-size:8px;letter-spacing:.04em;text-transform:uppercase}td{padding:6px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere}.status{display:inline-flex;align-items:center;justify-content:center;min-height:16px;padding:2px 7px;border:1px solid currentColor;border-radius:999px;font-size:8px;font-weight:700;line-height:1;vertical-align:middle;white-space:nowrap}.status-success{color:#15803d;background:#f0fdf4}.status-warning{color:#a16207;background:#fefce8}.status-danger{color:#b91c1c;background:#fef2f2}.status-info{color:#1d4ed8;background:#eff6ff}.status-neutral{color:#475569;background:#f8fafc}.quota-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:8px}.quota-card{border:1px solid #e2e8f0;border-radius:7px;padding:8px 10px}.quota-title{margin:0 0 2px;font-size:9px;font-weight:650}.quota-value{display:inline;margin:0;font-size:16px;font-weight:750;color:#0f172a}.quota-value span{font-size:9px;color:#64748b;font-weight:500}.quota-used{display:inline;margin:0 0 0 8px;font-size:8px;color:#64748b}.empty{text-align:center;color:#94a3b8;padding:12px}.document-footer{display:flex;justify-content:space-between;margin-top:14px;padding-top:7px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:7.5px}@page{margin:12mm 14mm;size:A4}
</style>`;

export function buildEmployeeRecapPrintHtml(items: EmployeeRecapPrintItem[]) {
  return `<div id="employee-recap-print-container">${PRINT_STYLES}${items.map(buildRecapPage).join("")}</div>`;
}

export async function waitForEmployeeRecapImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          const finish = () => resolve();
          image.addEventListener("load", finish, { once: true });
          image.addEventListener("error", finish, { once: true });
          window.setTimeout(finish, 3000);
        }),
    ),
  );
}
