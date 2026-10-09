"use client";

import type { DefaultColumnFormat } from "@/components/dynamic-page";
import type { PaymentMethodDto, PlanDto, TenantSubscriptionDto } from "@/lib/dto/subscription";
import { formatDateId } from "@/lib/helper/date";
import type React from "react";
import { Edit, Filter, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const ITEMS_PER_PAGE = 10;
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const badge = (label: string, active: boolean) => <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>{label}</span>;

type HeaderToolbarProps = {
  label: string;
  onAdd: () => void;
  showFilter: boolean;
  setShowFilter: React.Dispatch<React.SetStateAction<boolean>>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
};

export const headerToolbar = ({ label, onAdd, showFilter, setShowFilter, search, setSearch }: HeaderToolbarProps) => {
  const activeCount = search.trim() ? 1 : 0;
  return <div>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
      <Button onClick={onAdd} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"><Plus className="h-4 w-4" />Tambah {label}</Button>
      <div className="flex-1" />
      <Button variant="outline" onClick={() => setShowFilter((value) => !value)} className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 transition-colors ${showFilter || activeCount > 0 ? "border-blue-500 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400" : "border-gray-300 text-slate-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"}`}>
        <Filter className="h-4 w-4" />Filter
        {activeCount > 0 && <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">{activeCount}</span>}
      </Button>
    </div>
    {showFilter && <div className="mb-6 rounded-lg border bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/50">
      <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-slate-900 dark:text-white">Filter Data {label}</h3>{activeCount > 0 && <button type="button" onClick={() => setSearch("")} className="flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"><X className="h-4 w-4" />Hapus Semua Filter</button>}</div>
      <div className="max-w-md"><Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Cari</Label><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Cari ${label.toLowerCase()}...`} className="w-full rounded-lg border bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700" /></div>
    </div>}
  </div>;
};

export function renderManagementActions<T extends { id: string }>({ row, onEdit, onDelete, deleteId, setDeleteId, deleteLabel }: {
  row: T;
  onEdit: (row: T) => void;
  onDelete: (id: string) => void;
  deleteId: string | null;
  setDeleteId: React.Dispatch<React.SetStateAction<string | null>>;
  deleteLabel: string;
}) {
  return <div className="flex justify-end gap-2">
    <button type="button" onClick={() => onEdit(row)} title="Edit" className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20"><Edit className="h-4 w-4" /></button>
    <Popover open={deleteId === row.id} onOpenChange={(open) => setDeleteId(open ? row.id : null)}>
      <PopoverTrigger asChild><button type="button" title="Hapus" className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-4 w-4" /></button></PopoverTrigger>
      <PopoverContent className="w-64 space-y-3"><p className="text-sm">Yakin ingin menghapus {deleteLabel.toLowerCase()} ini?</p><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Batal</Button><Button variant="destructive" size="sm" onClick={() => onDelete(row.id)}>Hapus</Button></div></PopoverContent>
    </Popover>
  </div>;
}

export const subscriptionColumns: DefaultColumnFormat<TenantSubscriptionDto>[] = [
  { key: "tenant", title: "Tenant", formatter: (_value, row) => row.tenant?.companyName || "-" },
  { key: "plan", title: "Plan", formatter: (_value, row) => row.plan ? `${row.plan.name} (${row.plan.type === "MONTHLY" ? "Bulanan" : "Tahunan"})` : "-" },
  { key: "startDate", title: "Mulai", formatter: (value) => formatDateId(String(value)) },
  { key: "endDate", title: "Berakhir", formatter: (value) => formatDateId(String(value)) },
  { key: "paymentMethod", title: "Pembayaran", formatter: (_value, row) => row.paymentMethod ? `${row.paymentMethod.name} - ${row.paymentMethod.provider}` : "-" },
  { key: "status", title: "Status", formatter: (value) => badge(String(value), value === "ACTIVE") },
];

export const planColumns: DefaultColumnFormat<PlanDto>[] = [
  { key: "name", title: "Nama Plan" },
  { key: "type", title: "Periode", formatter: (value) => value === "MONTHLY" ? "Bulanan" : "Tahunan" },
  { key: "price", title: "Harga / Karyawan", formatter: (value) => value === null ? "Custom Pricing" : rupiah.format(Number(value)) },
  {
    key: "featurePermission",
    title: "Fitur",
    formatter: (value) => {
      if (!Array.isArray(value)) return "-";
      if (value.includes("*")) return "Semua fitur";
      return `${value.length} fitur`;
    },
  },
  { key: "isActive", title: "Status", formatter: (value) => badge(value ? "Aktif" : "Nonaktif", Boolean(value)) },
];

export const paymentMethodColumns: DefaultColumnFormat<PaymentMethodDto>[] = [
  { key: "name", title: "Nama" },
  { key: "code", title: "Code" },
  { key: "provider", title: "Provider" },
  { key: "category", title: "Kategori", formatter: (value) => String(value).replaceAll("_", " ") },
  { key: "feeType", title: "Biaya", formatter: (_value, row) => {
    const fixed = Number(row.feeFixed);
    const percentage = Number(row.feePercentage);
    if (row.feeType === "fixed") return rupiah.format(fixed);
    if (row.feeType === "percentage") return `${percentage}%`;
    return `${rupiah.format(fixed)} + ${percentage}%`;
  } },
  { key: "sortOrder", title: "Urutan" },
  { key: "isActive", title: "Status", formatter: (value) => badge(value ? "Aktif" : "Nonaktif", Boolean(value)) },
];
