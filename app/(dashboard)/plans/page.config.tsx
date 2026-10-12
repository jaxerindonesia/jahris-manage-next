import type { DefaultColumnFormat } from "@/components/dynamic-page";
import type { PlanDto } from "@/lib/dto/subscription";

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

export const planColumns: DefaultColumnFormat<PlanDto>[] = [
  { key: "name", title: "Nama Plan" },
  {
    key: "type",
    title: "Periode",
    formatter: (value) => (value === "MONTHLY" ? "Bulanan" : "Tahunan"),
  },
  {
    key: "price",
    title: "Harga / Karyawan",
    formatter: (value) => (value === null ? "Custom Pricing" : rupiah.format(Number(value))),
  },
  {
    key: "featurePermission",
    title: "Fitur",
    formatter: (value) => {
      if (!Array.isArray(value)) return "-";
      if (value.includes("*")) return "Semua fitur";
      return `${value.length} fitur`;
    },
  },
  {
    key: "isActive",
    title: "Status",
    formatter: (value) => statusBadge(Boolean(value)),
  },
];
