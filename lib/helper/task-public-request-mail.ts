import { escapeMailHtml, sendTenantMail } from "@/lib/helper/mailer";
import { PUBLIC_REQUEST_PRIORITIES } from "@/lib/helper/task-public-request";

type TaskRequestConfirmation = {
  tenantId: string | null;
  to: string;
  companyName: string;
  departmentName: string;
  ticketNumber: string | null;
  requesterName: string;
  title: string;
  requestType: string;
  priority: string;
};

export async function sendTaskRequestConfirmation(input: TaskRequestConfirmation) {
  const priorityLabel =
    PUBLIC_REQUEST_PRIORITIES.find((item) => item.value === input.priority)?.label || input.priority;
  const ticket = input.ticketNumber || "-";
  const rows = [
    ["Nomor Tiket", ticket],
    ["Judul", input.title],
    ["Jenis Request", input.requestType],
    ["Prioritas", priorityLabel],
    ["Status", "Antrian Request"],
  ];

  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#14181F">
  <h2 style="margin:0 0 4px">Request Anda sudah kami terima</h2>
  <p style="margin:0 0 16px;color:#525B69">${escapeMailHtml(input.companyName)} &middot; ${escapeMailHtml(input.departmentName)}</p>
  <p>Halo ${escapeMailHtml(input.requesterName)},</p>
  <p>Terima kasih. Request Anda sudah masuk ke antrian dan akan direview oleh tim ${escapeMailHtml(input.departmentName)}.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    ${rows
      .map(
        ([label, value]) => `<tr>
      <td style="padding:8px;border:1px solid #D5DBE3;background:#F1F3F6;width:40%;font-weight:bold">${escapeMailHtml(label)}</td>
      <td style="padding:8px;border:1px solid #D5DBE3">${escapeMailHtml(value)}</td>
    </tr>`,
      )
      .join("")}
  </table>
  <p style="color:#525B69;font-size:13px">Simpan nomor tiket ini untuk menanyakan perkembangan request Anda.</p>
</div>`;

  const text = [
    `Halo ${input.requesterName},`,
    "",
    `Request Anda sudah masuk ke antrian tim ${input.departmentName} (${input.companyName}).`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");

  return sendTenantMail(input.tenantId, {
    to: input.to,
    subject: `[${ticket}] Request diterima: ${input.title}`,
    html,
    text,
  });
}
