export type PayrollPaymentPhase = "confirm" | "processing" | "success";

export interface PayrollPaymentDialogProps {
  open: boolean;
  phase: PayrollPaymentPhase;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}
