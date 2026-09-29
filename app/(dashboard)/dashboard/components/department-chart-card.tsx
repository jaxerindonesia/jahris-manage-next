"use client";

import { Users } from "lucide-react";
import { cn, DARK_GLASS_PANEL_CLASS } from "@/lib/utils";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { DeptDist } from "./types";

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

type Props = {
  departmentDist: DeptDist[];
};

export default function DepartmentChartCard({ departmentDist }: Props) {
  return (
    <div className={cn("rounded-2xl border border-gray-200 bg-white p-6", DARK_GLASS_PANEL_CLASS)}>
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-purple-500" />
        <h3 className="font-semibold dark:text-white">Distribusi Departemen</h3>
      </div>
      {departmentDist.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-400">
          Belum ada data departemen
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="h-[190px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={departmentDist} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {departmentDist.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    color: "#f1f5f9",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 max-h-20 overflow-y-auto pr-1">
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
              {departmentDist.map((department, i) => (
                <div key={`${department.name}-${i}`} className="flex min-w-0 items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="max-w-28 truncate" title={department.name}>{department.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
