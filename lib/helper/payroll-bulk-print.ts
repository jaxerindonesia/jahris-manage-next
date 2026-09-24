import type { PayrollDto } from "@/lib/dto/payroll";
import { months } from "@/lib/helper/date";

function escapeHtml(value: unknown) {
  return String(value ?? "-").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function currency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 }).format(value || 0);
}

export function buildPayrollBulkPrintHtml(payrolls: PayrollDto[], brand: { companyName?: string; logoUrl?: string }) {
  const printedAt = new Date().toLocaleString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const pages = payrolls.map((payroll) => {
    const period = `${months.find((month) => month.value === payroll.month)?.label ?? payroll.month} ${payroll.year}`;
    const earnings = (payroll.componentValues ?? []).filter((item) => item.typeSnapshot === "EARNING");
    const deductions = (payroll.componentValues ?? []).filter((item) => item.typeSnapshot === "DEDUCTION");
    const componentRows = [
      ...earnings.map((item) => `<tr><td>${escapeHtml(item.nameSnapshot)}</td><td><span class="type earning">Penghasilan</span></td><td class="money">${escapeHtml(currency(item.amount))}</td></tr>`),
      ...deductions.map((item) => `<tr><td>${escapeHtml(item.nameSnapshot)}</td><td><span class="type deduction">Potongan</span></td><td class="money">-${escapeHtml(currency(item.amount))}</td></tr>`),
    ].join("");
    return `<section class="payroll-page">
      <header><div class="brand">${brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="Logo" />` : '<div class="brand-mark">HR</div>'}<div><strong>${escapeHtml(brand.companyName || "JAXER GRUP INDONESIA")}</strong><span>Human Resource Management</span></div></div><div class="doc"><strong>SLIP GAJI</strong><span>${escapeHtml(period)}</span></div></header>
      <div class="profile"><h1>${escapeHtml(payroll.user?.name)}</h1><p>${escapeHtml(payroll.user?.position || "Karyawan")} · ${escapeHtml(typeof payroll.user?.department === "string" ? payroll.user.department : payroll.user?.department?.name || "-")}</p><div class="meta"><div><label>Nomor Referensi</label><b>${escapeHtml(payroll.referenceNumber)}</b></div><div><label>Periode</label><b>${escapeHtml(period)}</b></div><div><label>Status</label><b class="status ${payroll.status === "PAID" ? "paid" : "pending"}">${payroll.status === "PAID" ? "Dibayar" : "Pending"}</b></div></div></div>
      <div class="summary"><div><label>Gaji Pokok</label><b>${escapeHtml(currency(payroll.basicSalary))}</b></div><div><label>Penghasilan Tambahan</label><b class="green">+ ${escapeHtml(currency(payroll.allowances))}</b></div><div><label>Total Potongan</label><b class="red">- ${escapeHtml(currency(payroll.deductions))}</b></div><div class="total"><label>Gaji Bersih</label><b>${escapeHtml(currency(payroll.totalSalary))}</b></div></div>
      <h2>Rincian Komponen Payroll</h2><table><thead><tr><th>Komponen</th><th>Jenis</th><th class="money">Nominal</th></tr></thead><tbody>${componentRows || '<tr><td colspan="3" class="empty">Tidak ada komponen tambahan atau potongan</td></tr>'}</tbody></table>
      <div class="attendance"><div><label>Hari Kerja Dibayar</label><b>${payroll.paidAttendanceDays ?? 0}</b></div><div><label>Jumlah Terlambat</label><b>${payroll.lateAttendanceDays ?? 0}</b></div><div><label>Potongan Terlambat</label><b>${escapeHtml(currency(payroll.lateDeductionAmount || 0))}</b></div><div><label>Potongan Tidak Hadir</label><b>${escapeHtml(currency(payroll.absentDeductionAmount || 0))}</b></div></div>
      <footer><span>${escapeHtml(brand.companyName || "JAXER GRUP INDONESIA")}</span><span>Dicetak ${escapeHtml(printedAt)}</span></footer>
    </section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payroll Semua Karyawan</title><style>
    @page{size:A4 portrait;margin:12mm 14mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#0f172a;font:10px/1.45 Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.payroll-page{break-after:page;page-break-after:always}.payroll-page:last-child{break-after:auto;page-break-after:auto}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #0f172a;padding-bottom:12px;margin-bottom:16px}.brand{display:flex;align-items:center;gap:10px}.brand img{width:64px;height:32px;object-fit:contain}.brand-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:#2563eb;color:#fff;font-weight:800}.brand strong,.brand span,.doc strong,.doc span{display:block}.brand strong{font-size:13px}.brand span{font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}.doc{text-align:right}.doc strong{font-size:12px}.doc span{color:#64748b}.profile{padding-bottom:14px;border-bottom:1px solid #e2e8f0}.profile h1{font-size:18px;margin:0}.profile p{margin:2px 0 10px;color:#64748b}.meta{display:grid;grid-template-columns:1.4fr 1fr .7fr;gap:12px}.meta label,.summary label,.attendance label{display:block;color:#94a3b8;font-size:7px;text-transform:uppercase;letter-spacing:.08em}.status{display:inline-block;padding:2px 8px;border-radius:999px}.paid{background:#dcfce7;color:#166534}.pending{background:#fef3c7;color:#92400e}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.summary>div{border:1px solid #e2e8f0;border-radius:7px;padding:10px}.summary b{display:block;margin-top:4px;font-size:13px}.summary .total{background:#1d4ed8;color:#fff;border-color:#1d4ed8}.summary .total label{color:#bfdbfe}.green{color:#15803d}.red{color:#dc2626}h2{font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin:17px 0 7px;padding-bottom:6px;border-bottom:1px solid #cbd5e1}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#f8fafc;color:#475569;text-align:left;padding:7px;border-block:1px solid #cbd5e1;font-size:8px;text-transform:uppercase}td{padding:7px;border-bottom:1px solid #e2e8f0}.money{text-align:right}.type{display:inline-block;border-radius:999px;padding:2px 7px;font-size:8px}.earning{background:#dcfce7;color:#166534}.deduction{background:#fee2e2;color:#991b1b}.empty{text-align:center;color:#94a3b8}.attendance{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}.attendance>div{border:1px solid #e2e8f0;border-radius:7px;padding:8px}.attendance b{display:block;margin-top:3px}footer{display:flex;justify-content:space-between;margin-top:18px;padding-top:8px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:7.5px}
  </style></head><body>${pages}</body></html>`;
}
