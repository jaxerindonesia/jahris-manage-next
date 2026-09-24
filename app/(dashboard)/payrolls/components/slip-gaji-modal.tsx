"use client";

import { X, Printer, CheckCircle, Clock } from "lucide-react";
import { PayrollDto } from "@/lib/dto/payroll";
import { months } from "@/lib/helper/date";
import { formatCurrency } from "@/lib/helper/format-currency";
import { useState } from "react";
import { AUTO_LATE_DEDUCTION_COMPONENT_NAME } from "@/lib/constants/payroll";

interface SlipGajiModalProps {
    isOpen?: boolean;
    detailItem?: PayrollDto;
    onClose: () => void;
    loading?: boolean;
}

type TenantConfig = {
    companyName?: string | null;
    companyUrl?: string | null;
    logoUrl?: string | null;
    logoDarkUrl?: string | null;
    tenantName?: string | null;
    tenantLogoUrl?: string | null;
    tenantLogoDarkUrl?: string | null;
};

export default function SlipGajiModal({
    isOpen,
    detailItem,
    onClose,
    loading = false,
}: SlipGajiModalProps) {
    const [tenantConfig] = useState<TenantConfig | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const parsed = JSON.parse(localStorage.getItem("hr_user_data") || "{}") as TenantConfig;
            return {
                companyName: parsed.companyName ?? parsed.tenantName ?? null,
                companyUrl: parsed.companyUrl ?? null,
                logoUrl: parsed.logoUrl ?? parsed.tenantLogoUrl ?? null,
                logoDarkUrl: parsed.logoDarkUrl ?? parsed.tenantLogoDarkUrl ?? null,
            };
        } catch {
            return null;
        }
    });

    const monthName = months.find((m) => m.value === detailItem?.month)?.label ?? "-";
    const periodLabel = `${monthName} ${detailItem?.year}`;

    if (!isOpen) return null;

    const handlePrint = () => {
        const slip = document.getElementById("slip-print-area");
        if (!slip) {
            window.print();
            return;
        }

        const printWindow = window.open("", "_blank", "width=1200,height=900");
        if (!printWindow) {
            window.print();
            return;
        }

        const styles = Array.from(
            document.querySelectorAll('link[rel="stylesheet"], style'),
        )
            .map((el) => el.outerHTML)
            .join("");

        printWindow.document.open();
        printWindow.document.write(`
          <html>
            <head>
              <title>Slip Gaji</title>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              ${styles}
              <style>
                html, body {
                  margin: 0 !important;
                  padding: 0 !important;
                  background: white !important;
                }
                #slip-print-area {
                  width: 100% !important;
                  max-width: 100% !important;
                  box-sizing: border-box !important;
                }
              </style>
            </head>
            <body style="margin:0;padding:0;background:#fff;">
              ${slip.outerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();

        const doPrint = () => {
            try {
                printWindow.focus();
                printWindow.print();
                printWindow.onafterprint = () => printWindow.close();
            } catch {
                printWindow.close();
            }
        };

        const schedulePrint = () => {
            if (printWindow.document.readyState === "complete") {
                setTimeout(doPrint, 250);
                return;
            }
            printWindow.onload = () => setTimeout(doPrint, 250);
        };

        schedulePrint();
    };

    return (
        <div className="no-print fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Card */}
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Slip Gaji Karyawan
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Periode: {periodLabel}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm"
                        >
                            <Printer className="w-4 h-4" />
                            Cetak / Download PDF
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all hover:rotate-90"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {!detailItem || loading ? (
                        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                            {loading ? "Memuat detail payroll..." : "Data payroll tidak ditemukan."}
                        </div>
                    ) : (
                        <SlipContent
                            payroll={detailItem}
                            tenantConfig={tenantConfig}
                            periodLabel={periodLabel}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}


function SlipContent({
    payroll,
    tenantConfig,
    periodLabel,
}: {
    payroll: PayrollDto;
    tenantConfig?: TenantConfig | null;
    periodLabel: string;
}) {
    const takeHomePay = payroll.basicSalary + payroll.allowances - payroll.deductions;
    const companyName = tenantConfig?.companyName?.trim() || "JAXER GRUP INDONESIA";
    const companyUrl = tenantConfig?.companyUrl?.trim() || "";
    const companyLogo =
        tenantConfig?.logoDarkUrl ||
        tenantConfig?.logoUrl ||
        tenantConfig?.tenantLogoDarkUrl ||
        tenantConfig?.tenantLogoUrl ||
        "/logo22.png";
    const isPaid = payroll.status === "PAID";
    const generatedAtLabel = new Date().toLocaleString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const referenceNumber =
        payroll.referenceNumber ||
        (payroll.createdAt
            ? `PYR-${new Date(payroll.createdAt).getFullYear()}-${String(payroll.id || "").slice(0, 8).toUpperCase()}`
            : `PYR-${String(payroll.id || "").slice(0, 8).toUpperCase()}`);
    const paymentStatusLabel = isPaid ? "Slip Sudah Dibayar" : "Slip Menunggu Pembayaran";
    const earningComponents = (payroll.componentValues || []).filter(
        (item) => item.typeSnapshot === "EARNING",
    );
    const deductionComponents = (payroll.componentValues || []).filter(
        (item) => item.typeSnapshot === "DEDUCTION",
    );

    return (
        <div
            id="slip-print-area"
            className="bg-white rounded-xl overflow-hidden border border-gray-200 text-gray-800"
            style={{ backgroundColor: "#fff", color: "#1f2937" }}
        >
            {/* ---- Header ---- */}
            <div
                className="px-8 py-6 text-white"
                style={{
                    background: "linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%)",
                }}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 items-center overflow-hidden">
                            <img
                                src={companyLogo}
                                alt={`Logo ${companyName}`}
                                style={{ maxWidth: "96px", maxHeight: "48px", objectFit: "contain" }}
                            />
                        </div>

                        <div>
                            <h1 className="text-xl font-bold tracking-wide">{companyName}</h1>
                            <p className="text-blue-200 text-sm">Human Resources Department</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-blue-200 text-xs uppercase tracking-widest font-semibold">
                            Slip Gaji
                        </p>
                        <p className="text-lg font-bold">{periodLabel}</p>
                    </div>
                </div>
            </div>

            {/* ---- Employee Info ---- */}
            <div className="px-8 py-5 bg-blue-50 border-b border-blue-100">
                <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                            Nama Karyawan
                        </p>
                        <p className="text-base font-bold text-gray-900">
                            {payroll.user?.name ?? "-"}
                        </p>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                            Nomor Referensi
                        </p>
                        <p className="text-base font-semibold text-gray-800">{referenceNumber}</p>
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                        <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${isPaid
                                ? "bg-green-100 text-green-700"
                                : "bg-yellow-100 text-yellow-700"
                                }`}
                        >
                            {isPaid ? (
                                <CheckCircle className="w-3.5 h-3.5" />
                            ) : (
                                <Clock className="w-3.5 h-3.5" />
                            )}
                            {isPaid ? "Sudah Dibayar" : "Menunggu Pembayaran"}
                        </span>
                    </div>
                </div>
            </div>

            {/* ---- Salary Breakdown ---- */}
            <div className="px-8 py-5">
                <table className="w-full">
                    <thead>
                        <tr className="border-b-2 border-gray-200">
                            <th className="text-left py-2 text-xs text-gray-500 uppercase tracking-wider font-semibold">
                                Komponen Gaji
                            </th>
                            <th className="text-right py-2 text-xs text-gray-500 uppercase tracking-wider font-semibold">
                                Jumlah
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {/* Penghasilan */}
                        <tr>
                            <td colSpan={2} className="pt-4 pb-1">
                                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                                    Penghasilan
                                </span>
                            </td>
                        </tr>
                        <tr>
                            <td className="py-2 pl-4 text-sm text-gray-700">
                                <div>Gaji Pokok</div>
                                {payroll.salaryType === "daily" && (
                                    <div className="text-xs text-gray-500">
                                        {formatCurrency(Number(payroll.salaryRate || 0))} ×{" "}
                                        {payroll.paidAttendanceDays || 0} hari hadir
                                    </div>
                                )}
                            </td>
                            <td className="py-2 text-right text-sm font-medium text-gray-900">
                                {formatCurrency(payroll.basicSalary)}
                            </td>
                        </tr>
                        <tr>
                            <td className="py-2 pl-4 text-sm text-gray-700">Tunjangan</td>
                            <td className="py-2 text-right text-sm font-medium text-green-600">
                                + {formatCurrency(payroll.allowances)}
                            </td>
                        </tr>
                        {earningComponents.map((item) => (
                            <tr key={item.id || item.nameSnapshot}>
                                <td className="py-2 pl-8 text-sm text-gray-600">{item.nameSnapshot}</td>
                                <td className="py-2 text-right text-sm text-gray-700">
                                    + {formatCurrency(item.amount)}
                                </td>
                            </tr>
                        ))}

                        {/* Potongan */}
                        <tr>
                            <td colSpan={2} className="pt-4 pb-1">
                                <span className="text-xs font-bold text-red-500 uppercase tracking-wider">
                                    Potongan
                                </span>
                            </td>
                        </tr>
                        <tr>
                            <td className="py-2 pl-4 text-sm text-gray-700">Potongan</td>
                            <td className="py-2 text-right text-sm font-medium text-red-500">
                                - {formatCurrency(payroll.deductions)}
                            </td>
                        </tr>
                        {deductionComponents.map((item) => (
                            <tr key={item.id || item.nameSnapshot}>
                                <td className="py-2 pl-8 text-sm text-gray-600">
                                    <div>{item.nameSnapshot}</div>
                                    {item.nameSnapshot === AUTO_LATE_DEDUCTION_COMPONENT_NAME && (
                                        <div className="text-xs text-gray-500">
                                            {formatCurrency(Number(payroll.lateDeductionRate || 0))} ×{" "}
                                            {payroll.lateAttendanceDays || 0} hari terlambat
                                        </div>
                                    )}
                                </td>
                                <td className="py-2 text-right text-sm text-gray-700">
                                    - {formatCurrency(item.amount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Total Gaji */}
                <div className="mt-4 p-4 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl">
                    <div className="flex items-center justify-between text-white">
                        <div>
                            <p className="text-sm text-blue-100 font-medium">Take Home Pay</p>
                            <p className="text-xs text-blue-200 mt-0.5">
                                Gaji Pokok + Tunjangan − Potongan
                            </p>
                        </div>
                        <p className="text-2xl font-semibold">{formatCurrency(takeHomePay)}</p>
                    </div>
                </div>
            </div>

            {/* ---- Footer / Signature ---- */}
            <div className="px-8 pb-8 pt-2 border-t border-gray-100">
                <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                        Validasi Dokumen
                    </p>
                    <div className="mt-2 grid gap-2 text-sm text-slate-700">
                        <p>
                            Dokumen ini valid berdasarkan status payroll di sistem:{" "}
                            <span className="font-semibold">{paymentStatusLabel}</span>.
                        </p>
                        <p>
                            Waktu slip dibuka/dicetak:{" "}
                            <span className="font-semibold">{generatedAtLabel}</span>.
                        </p>
                    </div>
                </div>

                <p className="text-center text-xs text-gray-400 mt-6">
                    Dokumen ini dibuat secara otomatis oleh sistem HR {companyName}.
                    {companyUrl ? ` Informasi perusahaan: ${companyUrl}.` : ""}
                </p>
            </div>
        </div>
    );
}
