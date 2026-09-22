export type AttendanceRecapDetailDto = {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  notes: string | null;
  workHours: string | null;
};

export type SubmissionRecapHistoryDto = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  createdAt: string;
};

export type LeaveQuotaRecapDto = {
  configName: string;
  maxDays: number;
  usedDays: number;
  remainingDays: number;
};

export type EmployeeRecapDto = {
  user: { id: string; name: string };
  month: number;
  year: number;
  startDate?: string;
  endDate?: string;
  attendance: {
    summary: {
      totalHadir: number;
      totalTelat: number;
      totalAlpha: number;
      totalIzin: number;
    };
    details: AttendanceRecapDetailDto[];
  };
  submissions: {
    leaveQuotas: LeaveQuotaRecapDto[];
    history: SubmissionRecapHistoryDto[];
  };
};
