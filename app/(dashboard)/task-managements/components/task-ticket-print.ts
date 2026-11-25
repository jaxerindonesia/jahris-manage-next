import { formatDateId } from "@/lib/helper/date";
import {
  TASK_PRIORITIES,
  isDoneListName,
  isRejectedListName,
  splitTaskLines,
} from "@/lib/helper/task-ticket";

type TaskTicketPrintData = {
  task: {
    title: string;
    description?: string | null;
    ticketNumber?: string | null;
    priority?: string | null;
    requester?: string | null;
    supportPic?: string | null;
    objective?: string | null;
    scope?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    listId: string;
    members: { user: { name: string } }[];
    categories: { category: { id: string } }[];
  };
  department: { name: string; tenant?: { companyName: string } | null };
  lists: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

const TICKET_STYLES = `
@page{size:A5;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#14181F;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.card{width:148mm;height:210mm;padding:9mm 10mm;display:flex;flex-direction:column;gap:3mm;font-size:9pt;overflow:hidden;break-after:page}
.card:last-child{break-after:auto}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #14181F;padding-bottom:2.5mm}
.org{font-family:ui-monospace,Menlo,monospace;font-size:7.5pt;color:#0F766E;text-transform:uppercase}
.ttl{font-size:20pt;font-weight:800;line-height:1;margin:1mm 0 0}
.lb{font-size:6.5pt;font-weight:700;letter-spacing:.6px;color:#525B69;text-transform:uppercase}
.no{border:1.5px solid #14181F;border-radius:6px;height:9mm;width:52mm;display:flex;align-items:center;padding:0 3mm;font-family:ui-monospace,monospace;font-size:11pt;font-weight:700}
.sec{display:flex;align-items:center;gap:2.5mm;margin-top:1mm}
.sec b{font-family:ui-monospace,monospace;font-size:7.5pt;color:#0F766E}
.sec span{font-weight:700;font-size:10.5pt}
.sec i{flex:1;height:1px;background:#D5DBE3}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:2mm 5mm}
.f{display:flex;flex-direction:column;gap:1mm;min-width:0}
.ln{min-height:6.5mm;border-bottom:1px solid #9AA3B0;display:flex;align-items:flex-end;padding-bottom:.8mm;font-weight:600;font-size:9pt}
.cbs{display:flex;gap:2mm 3.5mm;flex-wrap:wrap}
.cb{display:flex;align-items:center;gap:1.4mm;font-size:8.5pt}
.cb i{width:3.2mm;height:3.2mm;border:1.2px solid #525B69;border-radius:1mm;flex-shrink:0}
.cb.on{font-weight:700}.cb.on i{background:#14181F;border-color:#14181F}
.jp{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:5mm}
.ref{background:#F1F3F6;border-radius:1.5mm;padding:2mm 3mm;font-size:8pt;color:#525B69}
.tl{display:grid;grid-template-columns:30mm 1fr 1fr 1fr;gap:1.2mm 3mm;align-items:end}
.tl .n{font-size:8.5pt;font-weight:600;padding-bottom:.8mm}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin-top:auto}
.sig div{display:flex;flex-direction:column;gap:14mm}
.sig small{border-top:1px solid #14181F;padding-top:1mm;font-size:6.5pt;color:#525B69}
.sig .lead{color:#B45309}
.warn{background:#FDF3E1;border:1px solid #E8C98A;border-radius:1.5mm;padding:1.8mm 2.5mm;font-size:7pt;color:#7A4A06}
.ft{display:flex;justify-content:space-between;font-size:6.5pt;color:#525B69}
.desc{font-size:9.5pt;line-height:1.55;display:flex;flex-direction:column;gap:4mm;flex:1;overflow:hidden}
.desc p{margin:0;white-space:pre-wrap}
.desc .h{font-size:10.5pt;font-weight:700;margin-bottom:.6mm}
.desc ul{margin:0;padding-left:5mm;display:flex;flex-direction:column;gap:1mm}
`;

function escapeHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function checkbox(label: string, checked: boolean) {
  return `<span class="cb${checked ? " on" : ""}"><i></i>${escapeHtml(label)}</span>`;
}

function field(label: string, value?: string | null) {
  return `<div class="f"><span class="lb">${escapeHtml(label)}</span><div class="ln">${escapeHtml(value || "-")}</div></div>`;
}

function section(index: number, title: string) {
  return `<div class="sec"><b>0${index}</b><span>${escapeHtml(title)}</span><i></i></div>`;
}

function bulletBlock(title: string, value?: string | null) {
  const lines = splitTaskLines(value);
  if (lines.length === 0) return "";
  return `<div><div class="h">${escapeHtml(title)}</div><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div>`;
}

function buildTimelineRows(data: TaskTicketPrintData) {
  const stages = data.lists.slice(1).filter((list) => !isRejectedListName(list.name));
  const finalStage = stages.find((list) => isDoneListName(list.name)) ?? stages[stages.length - 1];
  const rows = [{ label: "Mulai kerja", target: data.task.startDate }];
  stages.forEach((list) => {
    rows.push({ label: list.name, target: list.id === finalStage?.id ? data.task.dueDate : null });
  });

  return rows
    .map((row) => `<span class="n">${escapeHtml(row.label)}</span><div class="ln">${row.target ? escapeHtml(formatDateId(row.target)) : ""}</div><div class="ln"></div><div class="ln"></div>`)
    .join("");
}

function buildTicketHtml(data: TaskTicketPrintData) {
  const { task, department } = data;
  const organization = [department.name, department.tenant?.companyName].filter(Boolean).join(" · ");
  const ticketNumber = task.ticketNumber ? `#${task.ticketNumber}` : "-";
  const selectedCategoryIds = new Set(task.categories.map((item) => item.category.id));
  const pic = task.members.map((member) => member.user.name).join(", ");
  const header = (title: string) => `
    <div class="hd">
      <div><div class="org">${escapeHtml(organization)}</div><h1 class="ttl">${escapeHtml(title)}</h1></div>
      <div class="f"><span class="lb">No. Tiket</span><div class="no">${escapeHtml(ticketNumber)}</div></div>
    </div>`;
  const footer = (page: number) => `<div class="ft"><span>Lembar ${page} dari 2</span><span>${escapeHtml(organization)}</span></div>`;

  const firstPage = `
  <section class="card">
    ${header("Kartu Tiket")}
    ${section(1, "Informasi Pekerjaan")}
    ${field("Judul Pekerjaan", task.title)}
    <div class="g2">
      ${field("Pemohon / Divisi", task.requester)}
      ${field("Divisi Pelaksana", department.name)}
    </div>
    <div class="jp">
      <div class="f"><span class="lb">Jenis</span><div class="cbs">${data.categories.length > 0 ? data.categories.map((category) => checkbox(category.name, selectedCategoryIds.has(category.id))).join("") : "-"}</div></div>
      <div class="f"><span class="lb">Prioritas</span><div class="cbs">${TASK_PRIORITIES.map((priority) => checkbox(priority.label, task.priority === priority.value)).join("")}</div></div>
    </div>
    <div class="ref">Deskripsi, tujuan &amp; ruang lingkup lengkap &rarr; <b>Lembar 2</b></div>
    ${section(2, "Penanggung Jawab")}
    <div class="g2">${field("PIC", pic)}${field("PIC Pendukung", task.supportPic)}</div>
    ${section(3, "Timeline")}
    <div class="tl"><span></span><span class="lb">Target</span><span class="lb">Realisasi</span><span class="lb">Paraf</span>${buildTimelineRows(data)}</div>
    ${section(4, "Status")}
    <div class="cbs">${data.lists.map((list) => checkbox(list.name, list.id === task.listId)).join("")}</div>
    <div class="sig">
      <div><span class="lb">Pemohon</span><small>Nama &amp; tanda tangan</small></div>
      <div><span class="lb">PIC</span><small>Nama &amp; tanda tangan</small></div>
      <div><span class="lb lead">Leader ${escapeHtml(department.name)} (Approval)</span><small>Nama &amp; tanda tangan</small></div>
    </div>
    <div class="warn"><b>Wajib:</b> pekerjaan tidak dinyatakan selesai sebelum di-approve Leader ${escapeHtml(department.name)}.</div>
    ${footer(1)}
  </section>`;

  const secondPage = `
  <section class="card">
    ${header("Lampiran Deskripsi")}
    ${field("Judul Pekerjaan", task.title)}
    <div class="desc">
      <div><div class="h">Deskripsi</div><p>${escapeHtml(task.description || "-")}</p></div>
      ${bulletBlock("Tujuan", task.objective)}
      ${bulletBlock("Ruang Lingkup", task.scope)}
    </div>
    ${footer(2)}
  </section>`;

  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(ticketNumber)} - ${escapeHtml(task.title)}</title><style>${TICKET_STYLES}</style></head><body>${firstPage}${secondPage}</body></html>`;
}

export function printTaskTicket(data: TaskTicketPrintData) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    frame.remove();
    return;
  }

  frameDocument.open();
  frameDocument.write(buildTicketHtml(data));
  frameDocument.close();

  frameWindow.onafterprint = () => frame.remove();
  setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
  }, 100);
}
