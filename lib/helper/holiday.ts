type NationalHolidayItem = {
  date: string;
  name: string;
};

async function fetchNationalHolidayYear(year: number) {
  const response = await fetch(`https://api-harilibur.pages.dev/api?year=${year}`, {
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil data hari libur tahun ${year}`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.length) throw new Error(`Data hari libur tahun ${year} belum tersedia`);
  const holidays: NationalHolidayItem[] = data.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Data hari libur tidak valid");
    const holiday = item as Record<string, unknown>;
    if (holiday.is_national_holiday === false) return [];
    if (holiday.is_national_holiday !== true || typeof holiday.holiday_date !== "string" || typeof holiday.holiday_name !== "string") {
      throw new Error("Data hari libur tidak valid");
    }
    const parts = holiday.holiday_date.split("-");
    const date = parts.map((part, index) => index ? part.padStart(2, "0") : part).join("-");
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!date.startsWith(`${year}-`) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error("Tanggal hari libur tidak valid");
    }
    return [{ date, name: holiday.holiday_name }];
  });
  if (!holidays.length) throw new Error(`Data hari libur nasional tahun ${year} belum tersedia`);
  return holidays;
}

export async function getNationalHolidaysByYears(years: number[]) {
  const uniqueYears = Array.from(new Set(years));
  const holidays = await Promise.all(uniqueYears.map(fetchNationalHolidayYear));
  return holidays.flat();
}

export async function getNationalHolidayByDate(dateKey: string) {
  const year = Number(dateKey.slice(0, 4));
  const holidays = await getNationalHolidaysByYears([year]);
  return holidays.find((holiday) => holiday.date === dateKey) ?? null;
}
