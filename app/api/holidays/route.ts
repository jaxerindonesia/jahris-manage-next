export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/tenant";
import { getNationalHolidaysByYears } from "@/lib/helper/holiday";

export async function GET() {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;

    const year = new Date().getFullYear();
    const results = await Promise.allSettled([
      getNationalHolidaysByYears([year]),
      getNationalHolidaysByYears([year + 1]),
    ]);
    const allHolidays = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (!allHolidays.length) throw new Error("Gagal mengambil data hari libur");

    // Filter hanya hari libur yang belum lewat + hitung daysLeft
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = allHolidays
      .map((h) => {
        const [y, m, d] = h.date.split("-").map(Number);
        const target = new Date(y, m - 1, d);
        target.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil(
          (target.getTime() - today.getTime()) / 86400000,
        );
        return { ...h, daysLeft };
      })
      .filter((h) => h.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);

    return NextResponse.json({ data: upcoming });
  } catch (error) {
    return NextResponse.json(
      { message: "Gagal mengambil data hari libur", error: String(error) },
      { status: 500 },
    );
  }
}
