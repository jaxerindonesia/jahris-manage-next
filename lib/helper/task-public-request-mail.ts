import { escapeMailHtml, sendTenantMail } from "@/lib/helper/mailer";
import { PUBLIC_REQUEST_PRIORITIES, REQUEST_QUEUE_LIST_NAME } from "@/lib/helper/task-public-request";
import { isDoneListName, isRejectedListName } from "@/lib/helper/task-ticket";

type MailRow = [label: string, value: string];

type TaskMailBase = {
  tenantId: string | null;
  to: string;
  companyName: string;
  departmentName: string;
  ticketNumber: string | null;
  requesterName: string;
  title: string;
};

type TaskRequestConfirmation = TaskMailBase & {
  requestType: string;
  priority: string;
};

type TaskStatusUpdate = TaskMailBase & {
  previousStatus: string;
  status: string;
};

function renderTaskMail(input: {
  heading: string;
  companyName: string;
  departmentName: string;
  requesterName: string;
  intro: string;
  rows: MailRow[];
  note: string;
}) {
  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#14181F">
  <h2 style="margin:0 0 4px">${escapeMailHtml(input.heading)}</h2>
  <p style="margin:0 0 16px;color:#525B69">${escapeMailHtml(input.companyName)} &middot; ${escapeMailHtml(input.departmentName)}</p>
  <p>Halo ${escapeMailHtml(input.requesterName)},</p>
  <p>${escapeMailHtml(input.intro)}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    ${input.rows
      .map(
        ([label, value]) => `<tr>
      <td style="padding:8px;border:1px solid #D5DBE3;background:#F1F3F6;width:40%;font-weight:bold">${escapeMailHtml(label)}</td>
      <td style="padding:8px;border:1px solid #D5DBE3">${escapeMailHtml(value)}</td>
    </tr>`,
      )
      .join("")}
  </table>
  <p style="color:#525B69;font-size:13px">${escapeMailHtml(input.note)}</p>
</div>`;

  const text = [
    `Halo ${input.requesterName},`,
    "",
    input.intro,
    "",
    ...input.rows.map(([label, value]) => `${label}: ${value}`),
    "",
    input.note,
  ].join("\n");

  return { html, text };
}

export async function sendTaskRequestConfirmation(input: TaskRequestConfirmation) {
  const priorityLabel =
    PUBLIC_REQUEST_PRIORITIES.find((item) => item.value === input.priority)?.label || input.priority;
  const ticket = input.ticketNumber || "-";

  const { html, text } = renderTaskMail({
    heading: "Request Anda sudah kami terima",
    companyName: input.companyName,
    departmentName: input.departmentName,
    requesterName: input.requesterName,
    intro: `Terima kasih. Request Anda sudah masuk ke antrian dan akan direview oleh tim ${input.departmentName}.`,
    rows: [
      ["Nomor Tiket", ticket],
      ["Judul", input.title],
      ["Jenis Request", input.requestType],
      ["Prioritas", priorityLabel],
      ["Status", REQUEST_QUEUE_LIST_NAME],
    ],
    note: "Simpan nomor tiket ini untuk menanyakan perkembangan request Anda.",
  });

  return sendTenantMail(input.tenantId, {
    to: input.to,
    subject: `[${ticket}] Request diterima: ${input.title}`,
    html,
    text,
  });
}

function describeStatus(status: string, departmentName: string) {
  if (isDoneListName(status)) {
    return {
      subject: "Request selesai",
      heading: "Request Anda sudah selesai",
      intro: `Request Anda sudah selesai dikerjakan oleh tim ${departmentName}.`,
      note: "Jika masih ada kendala, balas email ini dengan menyertakan nomor tiket.",
    };
  }
  if (isRejectedListName(status)) {
    return {
      subject: "Request tidak dilanjutkan",
      heading: "Request Anda tidak dilanjutkan",
      intro: `Request Anda tidak dapat dilanjutkan oleh tim ${departmentName}.`,
      note: "Hubungi tim terkait dengan menyertakan nomor tiket untuk informasi lebih lanjut.",
    };
  }
  return {
    subject: `Status: ${status}`,
    heading: "Status request Anda diperbarui",
    intro: `Request Anda sekarang berstatus "${status}" di tim ${departmentName}.`,
    note: "Anda akan menerima email lagi setiap kali status request berubah.",
  };
}

export async function sendTaskStatusUpdate(input: TaskStatusUpdate) {
  const ticket = input.ticketNumber || "-";
  const copy = describeStatus(input.status, input.departmentName);

  const { html, text } = renderTaskMail({
    heading: copy.heading,
    companyName: input.companyName,
    departmentName: input.departmentName,
    requesterName: input.requesterName,
    intro: copy.intro,
    rows: [
      ["Nomor Tiket", ticket],
      ["Judul", input.title],
      ["Status Sebelumnya", input.previousStatus],
      ["Status Sekarang", input.status],
    ],
    note: copy.note,
  });

  return sendTenantMail(input.tenantId, {
    to: input.to,
    subject: `[${ticket}] ${copy.subject}: ${input.title}`,
    html,
    text,
  });
}
