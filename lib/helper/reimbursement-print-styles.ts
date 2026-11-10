import type { ReimbursementReceiptLayout } from "@/app/(dashboard)/reimbursements/types";

export function getReimbursementPrintStyles(layout: ReimbursementReceiptLayout) {
  const twoColumns = layout === "two";

  return `
    @page { size: A4 portrait; margin: ${twoColumns ? "8mm 12mm" : "12mm 14mm"}; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1f2937; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .slip-header { background: linear-gradient(90deg, #1e3a8a, #1d4ed8); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; color: #fff; }
    .slip-header-left { display: flex; align-items: center; gap: 14px; }
    .slip-header-logo { display: block; width: 92px; height: 44px; object-fit: contain; object-position: center; flex-shrink: 0; }
    .slip-header-identity { display: flex; min-height: 42px; flex-direction: column; justify-content: center; }
    .slip-header-identity.has-logo { border-left: 1px solid rgba(255,255,255,.3); padding-left: 14px; }
    .slip-header-company { font-size: 14pt; font-weight: 700; line-height: 1.1; }
    .slip-header-dept { margin-top: 4px; font-size: 8pt; line-height: 1.1; color: #bfdbfe; }
    .slip-header-right { text-align: right; }
    .slip-header-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.1em; color: #bfdbfe; }
    .slip-header-date { font-size: 12pt; font-weight: 700; }
    .slip-info { background: #eff6ff; border-bottom: 1px solid #bfdbfe; padding: 14px 24px; }
    .slip-info-row { display: flex; gap: 16px; margin-bottom: 10px; }
    .slip-info-row:last-child { margin-bottom: 0; }
    .slip-info-col { flex: 1; min-width: 0; }
    .slip-info-col-right { flex: 1; text-align: right; }
    .slip-info-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 2px; }
    .slip-info-value { font-size: 10pt; font-weight: 700; color: #111827; }
    .slip-info-value-sm { font-size: 9pt; font-weight: 600; color: #374151; }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 8pt; font-weight: 700; }
    .badge svg { width: 14px; height: 14px; }
    .badge-yellow { background: #fef9c3; color: #92400e; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .slip-body { padding: 16px 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { vertical-align: top; }
    .tbl-detail th { padding: 6px 0; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
    .tbl-detail td { padding: 8px 0; font-size: 9pt; color: #374151; border-bottom: 1px solid #f3f4f6; }
    .tbl-detail td.right, .tbl-detail th.right { text-align: right; }
    .tbl-detail td.bold { font-weight: 600; color: #111827; }
    .section-title { font-size: 10pt; font-weight: 700; margin: 14px 0 6px; color: #111827; }
    .total-box { margin-top: 14px; border-radius: 8px; padding: 12px 16px; color: #fff; }
    .total-box > div { display: flex; align-items: center; justify-content: space-between; }
    .total-box-label { font-size: 9pt; color: #bfdbfe; }
    .total-box-sub { font-size: 7pt; color: #93c5fd; margin-top: 2px; }
    .total-box-amount { font-size: 16pt; font-weight: 700; }
    .validasi { margin: 14px 0 0; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; }
    .validasi-title { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #1d4ed8; margin-bottom: 6px; }
    .validasi p { font-size: 8pt; color: #374151; margin-bottom: 3px; }
    .validasi p:last-child { margin-bottom: 0; }
    .footer-note { margin-top: 14px; text-align: center; font-size: 7pt; color: #9ca3af; }
    .lampiran-section { padding: ${twoColumns ? "10mm 16px" : "16px 24px"}; page-break-before: always; break-before: page; }
    .lampiran-title { font-size: ${twoColumns ? "11pt" : "13pt"}; font-weight: 700; color: #111827; margin-bottom: 2px; }
    .lampiran-sub { font-size: 7.5pt; color: #6b7280; margin-bottom: ${twoColumns ? "8px" : "16px"}; }
    .expense-group { margin-bottom: ${twoColumns ? "12px" : "20px"}; }
    .expense-group-bar { display: flex; align-items: center; gap: 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: ${twoColumns ? "4px 10px" : "6px 12px"}; margin-bottom: ${twoColumns ? "6px" : "10px"}; }
    .expense-badge { color: #fff; font-size: 7pt; font-weight: 700; text-transform: uppercase; border-radius: 4px; padding: 2px 7px; }
    .expense-date { font-size: 8.5pt; color: #374151; }
    .expense-amount { font-size: 8.5pt; font-weight: 700; color: #111827; margin-left: auto; }
    .photo-grid { display: grid; grid-template-columns: ${twoColumns ? "repeat(2, minmax(0, 1fr))" : "1fr"}; gap: 10px; align-items: start; }
    .photo-card { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; page-break-inside: avoid; break-inside: avoid; background: #fff; display: flex; flex-direction: column; color: inherit; text-decoration: none; }
    .photo-card-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; padding: 4px 10px; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #4b5563; }
    .photo-card-header svg { width: 10px; height: 10px; }
    .photo-card-body { padding: 6px; text-align: center; background: #fff; display: flex; align-items: center; justify-content: center; flex: 1; }
    .photo-card-body img { display: block; margin: 0 auto; max-width: 100%; width: auto; height: auto; max-height: ${twoColumns ? "125mm" : "200mm"}; object-fit: contain; border-radius: 4px; }
  `;
}
