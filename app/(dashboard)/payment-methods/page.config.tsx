import type { DefaultColumnFormat } from "@/components/dynamic-page";
import type { PaymentMethodDto } from "@/lib/dto/subscription";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const statusBadge = (isActive: boolean) => (
  <span
    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
      isActive
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
    }`}
  >
    {isActive ? "Aktif" : "Nonaktif"}
  </span>
);

export const paymentMethodColumns: DefaultColumnFormat<PaymentMethodDto>[] = [
  { key: "name", title: "Nama" },
  { key: "code", title: "Code" },
  { key: "provider", title: "Provider" },
  {
    key: "category",
    title: "Kategori",
    formatter: (value) => String(value).replaceAll("_", " "),
  },
  {
    key: "feeType",
    title: "Biaya",
    formatter: (_value, row) => {
      const fixed = Number(row.feeFixed);
      const percentage = Number(row.feePercentage);
      if (row.feeType === "fixed") return rupiah.format(fixed);
      if (row.feeType === "percentage") return `${percentage}%`;
      return `${rupiah.format(fixed)} + ${percentage}%`;
    },
  },
  { key: "sortOrder", title: "Urutan" },
  {
    key: "isActive",
    title: "Status",
    formatter: (value) => statusBadge(Boolean(value)),
  },
];
