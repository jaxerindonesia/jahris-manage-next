import { parseApiError } from "@/lib/helper/response-api";
import type { ReimbursementForm } from "./types";

export async function saveReimbursement(form: ReimbursementForm) {
  const body = new FormData();
  for (const field of ["userId", "title", "bankName", "accountNumber", "description"] as const) {
    body.set(field, form[field]);
  }
  body.set("details", JSON.stringify(form.details.map((detail, index) => {
    detail.files.forEach((file) => body.append(`receipt-${index}`, file));
    return { id: detail.id, category: detail.category, amount: detail.amount,
      date: detail.date, receiptUrls: detail.receiptUrls };
  })));
  const response = await fetch(form.id ? `/api/reimbursements/${form.id}` : "/api/reimbursements", {
    method: form.id ? "PUT" : "POST", body,
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Gagal menyimpan reimbursement"));
}
