"use client";

import { Eye, Filter, X } from "lucide-react";
import type React from "react";
import type { DefaultColumnFormat } from "@/components/dynamic-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActivityLogDto } from "@/lib/dto/activity-log";
import { formatDateId, formatTimeId } from "@/lib/helper/date";
import {
  ACTIVITY_LOG_ACTION_LABELS,
  ACTIVITY_LOG_MODULES,
  type ActivityLogTenantOption,
} from "./types";

export const ITEMS_PER_PAGE = 20;

interface HeaderToolbarProps {
  isSuperAdmin: boolean;
  tenants: ActivityLogTenantOption[];
  filters: {
    show: boolean;
    setShow: React.Dispatch<React.SetStateAction<boolean>>;
    activeCount: number;
    clear: () => void;
    searchTerm: string;
    setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
    module: string;
    setModule: (value: string) => void;
    tenantId: string;
    setTenantId: (value: string) => void;
  };
}

export function getActivityModuleLabel(action: string) {
  const moduleName = action.split(".")[0];
  return ACTIVITY_LOG_MODULES.find((item) => item.value === moduleName)?.label ?? moduleName;
}

export function getActivityActionLabel(action: string) {
  const actionName = action.split(".").slice(1).join(".");
  return ACTIVITY_LOG_ACTION_LABELS[actionName] ?? actionName;
}

function getActionBadgeClass(action: string) {
  if (action.includes("delete") || action.includes("reject") || action.includes("failed")) {
    return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  }
  if (action.includes("create") || action.includes("approve") || action.includes("import")) {
    return "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  }
  return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
}

export const buildColumnFormats = (isSuperAdmin: boolean): DefaultColumnFormat<ActivityLogDto>[] => [
  {
    key: "createdAt",
    title: "Waktu",
    textClassName: "whitespace-nowrap",
    formatter: (value) => `${formatDateId(value)} ${formatTimeId(value)}`,
  },
  ...(isSuperAdmin
    ? [{
        key: "tenantName",
        title: "Perusahaan",
        formatter: (value: string | null) => value || "-",
      }]
    : []),
  {
    key: "actorName",
    title: "Pelaku",
    formatter: (value, row) => (
      <div>
        <p className="font-medium text-slate-900 dark:text-slate-100">{value || "Sistem"}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{row.actorRole || "-"}</p>
      </div>
    ),
  },
  {
    key: "action",
    title: "Aksi",
    formatter: (value: string) => (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-700/40 dark:text-gray-200">
          {getActivityModuleLabel(value)}
        </span>
        <span className={`rounded-md px-2 py-1 text-xs ${getActionBadgeClass(value)}`}>
          {getActivityActionLabel(value)}
        </span>
      </div>
    ),
  },
  {
    key: "message",
    title: "Keterangan",
    textClassName: "min-w-[280px] whitespace-normal",
    formatter: (value) => value || "-",
  },
];

export const headerToolbar = ({ isSuperAdmin, tenants, filters }: HeaderToolbarProps) => (
  <div>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1" />

      <Button
        variant="outline"
        onClick={() => filters.setShow(!filters.show)}
        className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 transition-colors ${
          filters.show || filters.activeCount > 0
            ? "border-blue-500 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
            : "border-gray-300 text-slate-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        }`}
      >
        <Filter className="h-4 w-4" />
        Filter
        {filters.activeCount > 0 && (
          <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
            {filters.activeCount}
          </span>
        )}
      </Button>
    </div>

    {filters.show && (
      <div className="mb-6 rounded-lg border bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/50">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Filter Log Aktivitas
          </h3>
          {filters.activeCount > 0 && (
            <button
              onClick={filters.clear}
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              <X className="h-4 w-4" />
              Hapus Semua Filter
            </button>
          )}
        </div>

        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isSuperAdmin ? "lg:grid-cols-3" : ""}`}>
          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cari
            </Label>
            <Input
              type="text"
              value={filters.searchTerm}
              onChange={(event) => filters.setSearchTerm(event.target.value)}
              placeholder="Keterangan, nama pelaku..."
              className="w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {isSuperAdmin && (
            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Perusahaan
              </Label>
              <Select value={filters.tenantId} onValueChange={filters.setTenantId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Semua Perusahaan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Perusahaan</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Modul
            </Label>
            <Select value={filters.module} onValueChange={filters.setModule}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Semua Modul" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Modul</SelectItem>
                {ACTIVITY_LOG_MODULES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    )}
  </div>
);

export const renderActions = ({
  row,
  onView,
}: {
  row: ActivityLogDto;
  onView: (log: ActivityLogDto) => void;
}) => (
  <div className="flex justify-end gap-2">
    <Button
      onClick={() => onView(row)}
      variant="ghost"
      size="icon"
      title="Detail"
      className="h-9 w-9 rounded-lg p-0 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
    >
      <Eye className="h-4 w-4" />
    </Button>
  </div>
);
