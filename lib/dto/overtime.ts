export interface OvertimeDto {
  id?: string | null;
  tenantId?: string | null;
  userId: string;
  attendanceId?: string | null;
  overtimeDate: string;
  startTime?: string | null;
  endTime?: string | null;
  overtimeMinutes: number;
  requestedMinutes: number;
  description?: string | null;
  proofUrl?: string | null;
  checkInLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  } | null;
  checkOutLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  } | null;
  checkInFaceImage?: string | null;
  checkOutFaceImage?: string | null;
  rejectReason?: string | null;
  payMethod: "PER_HOUR" | "PER_DAY";
  hourlyRate: number;
  dailyRate: number;
  payoutAmount: number;
  status: "DRAFT" | "CHECKED_IN" | "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  user?: {
    id: string;
    name: string;
  } | null;
  attendance?: {
    id: string;
    date: string;
    checkIn?: string | null;
    checkOut?: string | null;
  } | null;
  approvalDecisions?: {
    approverUserId: string;
    approverUser: { name: string };
    status: "PENDING" | "APPROVED" | "REJECTED";
    reason?: string | null;
    decidedAt?: string | null;
  }[];
}

export interface OvertimeConfigDto {
  id?: string | null;
  tenantId?: string | null;
  payMethod: "PER_HOUR" | "PER_DAY";
  hourlyRate: number;
  dailyRate: number;
  hideNominal?: boolean;
  approverConfigs?: {
    approverUserId: string;
    approverUser: {
      id: string;
      name: string;
      email?: string | null;
    };
  }[];
  createdAt?: string | null;
  updatedAt?: string | null;
}
