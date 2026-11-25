import type { Prisma, PrismaClient } from "@prisma/client";

export const TASK_PRIORITIES = [
  { value: "HIGH", label: "Tinggi" },
  { value: "MEDIUM", label: "Sedang" },
  { value: "LOW", label: "Rendah" },
] as const;

const PRIORITY_VALUES = new Set<string>(TASK_PRIORITIES.map((item) => item.value));
const REJECTED_KEYWORDS = ["ditolak", "tolak", "reject", "batal", "cancel"];
const DONE_KEYWORDS = ["done", "completed", "selesai"];

export function normalizeDepartmentCode(value: unknown) {
  const code = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return code || null;
}

export function resolveDepartmentCode(name: string, code?: string | null) {
  const explicit = normalizeDepartmentCode(code);
  if (explicit) return explicit;

  const words = name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return "TSK";
  if (words.length === 1) return words[0].slice(0, 3);
  return words.map((word) => word[0]).join("").slice(0, 4);
}

export function normalizeTaskPriority(value: unknown) {
  const priority = String(value ?? "").toUpperCase();
  return PRIORITY_VALUES.has(priority) ? priority : null;
}

export function isRejectedListName(name: string) {
  const normalized = name.toLowerCase();
  return REJECTED_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isDoneListName(name: string) {
  const normalized = name.toLowerCase();
  return DONE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function splitTaskLines(value?: string | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export function isTicketNumberConflict(error: unknown) {
  const err = error as { code?: string; meta?: { target?: unknown } };
  if (err?.code !== "P2002") return false;
  return String(err.meta?.target ?? "").includes("ticket");
}

type TicketClient = PrismaClient | Prisma.TransactionClient;

export async function generateTaskTicketNumber(
  client: TicketClient,
  department: { id: string; name: string; code?: string | null },
  date = new Date(),
) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const prefix = `${resolveDepartmentCode(department.name, department.code)}${month}${year}-`;

  const latest = await client.task.findFirst({
    where: { departmentId: department.id, ticketNumber: { startsWith: prefix } },
    orderBy: { ticketNumber: "desc" },
    select: { ticketNumber: true },
  });

  const lastSequence = Number(latest?.ticketNumber?.slice(prefix.length) ?? 0) || 0;
  return `${prefix}${String(lastSequence + 1).padStart(3, "0")}`;
}

export function readTaskTicketFields(body: Record<string, unknown>) {
  const fields: {
    priority?: string | null;
    requester?: string | null;
    supportPic?: string | null;
    objective?: string | null;
    scope?: string | null;
  } = {};
  const text = (value: unknown) => String(value ?? "").trim() || null;

  if (body.priority !== undefined) fields.priority = normalizeTaskPriority(body.priority);
  if (body.requester !== undefined) fields.requester = text(body.requester);
  if (body.supportPic !== undefined) fields.supportPic = text(body.supportPic);
  if (body.objective !== undefined) fields.objective = text(body.objective);
  if (body.scope !== undefined) fields.scope = text(body.scope);
  return fields;
}
