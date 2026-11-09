export interface PayrollPeriod {
  month: number;
  year: number;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

function parsePayrollDate(value: Date | string) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error("Tanggal periode payroll tidak valid");
  }
  return date;
}

export function getPayrollPeriodRange({ month, year, startDate, endDate }: PayrollPeriod) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 100 || year > 9999) {
    throw new Error("Periode payroll tidak valid");
  }
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new Error("Tanggal mulai dan selesai periode wajib diisi bersama");
  }

  const gte = startDate ? parsePayrollDate(startDate) : new Date(Date.UTC(year, month - 1, 1));
  const lt = endDate ? parsePayrollDate(endDate) : new Date(Date.UTC(year, month, 1));
  if (endDate) {
    if (gte > lt) throw new Error("Rentang tanggal payroll tidak valid");
    lt.setUTCDate(lt.getUTCDate() + 1);
  }
  return { gte, lt };
}
