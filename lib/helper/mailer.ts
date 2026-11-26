import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/secret-box";

type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendTenantMail(tenantId: string | null, message: MailMessage) {
  if (!tenantId) return { sent: false, reason: "no-tenant" as const };

  const config = await prisma.tenantMailConfig.findUnique({ where: { tenantId } });
  if (!config) return { sent: false, reason: "not-configured" as const };

  const password = decryptSecret(config.passwordEncrypted);
  if (!password) return { sent: false, reason: "invalid-secret" as const };

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: password },
  });

  await transporter.sendMail({
    from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  return { sent: true as const };
}

export function escapeMailHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
