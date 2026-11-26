import { Dispatch, RefObject, SetStateAction } from "react";
import { Eye, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_PRIORITIES } from "@/lib/helper/task-ticket";

export type TaskAttachment = {
  id?: string;
  name: string;
  url: string;
  objectKey?: string | null;
  type?: string | null;
};

export type TaskCategory = {
  id: string;
  name: string;
};

export type TaskList = {
  id: string;
  name: string;
  tasks: { id: string; name?: string }[];
};

export type Member = {
  id: string;
  name: string;
  position?: string | null;
};

export type TaskFormState = {
  id?: string;
  title: string;
  description: string;
  priority: string;
  requester: string;
  supportPic: string;
  objective: string;
  scope: string;
  startDate: string;
  dueDate: string;
  listId: string;
  memberIds: string[];
  categoryIds: string[];
  attachments: TaskAttachment[];
};

export type TaskDetail = {
  id: string;
  ticketNumber?: string | null;
  title: string;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  listName: string;
  requester?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  requesterDivision?: string | null;
  requestType?: string | null;
  members: { user: Member }[];
  categories: { category: { id: string; name: string } }[];
  attachments: TaskAttachment[];
} | null;

type Props = {
  listDialogOpen: boolean;
  categoryDialogOpen: boolean;
  deleteDialogOpen: boolean;
  deleteTarget: { type: "list"; list: { id: string; name: string } } | { type: "task"; taskId: string } | null;
  detailTask: TaskDetail;
  taskModalOpen: boolean;
  savingTask: boolean;
  newListName: string;
  newCategoryName: string;
  board: {
    department: { users: Member[] };
    lists: { id: string; name: string }[];
  } | null;
  categories: TaskCategory[];
  taskForm: TaskFormState;
  taskFormListName: string;
  attachmentFileInputRef: RefObject<HTMLInputElement | null>;
  formatDate: (value?: string | null) => string;
  openAttachmentPicker: () => void;
  createList: () => Promise<void>;
  createCategory: () => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  closeTaskDetail: () => void;
  printTaskDetail: () => void;
  closeTaskModal: () => void;
  saveTask: () => Promise<void>;
  setListDialogOpen: Dispatch<SetStateAction<boolean>>;
  setCategoryDialogOpen: Dispatch<SetStateAction<boolean>>;
  setDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
  setNewListName: Dispatch<SetStateAction<string>>;
  setNewCategoryName: Dispatch<SetStateAction<string>>;
  setTaskForm: Dispatch<SetStateAction<TaskFormState>>;
  toggleCategory: (categoryId: string) => void;
  toggleMember: (memberId: string) => void;
  updateAttachment: (index: number, field: "name" | "url" | "type", value: string) => void;
  uploadAttachmentFile: (file: File) => Promise<{ name: string; url: string; objectKey?: string; type: string | null; size: number }>;
  removeAttachmentFromDraft: (index: number) => Promise<void>;
  confirmDelete: () => Promise<void>;
  canManageSelectedDepartment: boolean;
};

export function TaskManagementDialogs({
  listDialogOpen,
  categoryDialogOpen,
  deleteDialogOpen,
  deleteTarget,
  taskModalOpen,
  savingTask,
  newListName,
  newCategoryName,
  board,
  categories,
  taskForm,
  taskFormListName,
  attachmentFileInputRef,
  openAttachmentPicker,
  createList,
  createCategory,
  deleteCategory,
  detailTask,
  closeTaskDetail,
  printTaskDetail,
  closeTaskModal,
  saveTask,
  setListDialogOpen,
  setCategoryDialogOpen,
  setDeleteDialogOpen,
  setNewListName,
  setNewCategoryName,
  setTaskForm,
  toggleCategory,
  toggleMember,
  updateAttachment,
  uploadAttachmentFile,
  removeAttachmentFromDraft,
  formatDate,
  confirmDelete,
  canManageSelectedDepartment,
}: Props) {
  const hasInvalidDueDate = Boolean(
    taskForm.startDate &&
      taskForm.dueDate &&
      taskForm.dueDate < taskForm.startDate,
  );

  return (
    <>
      <Dialog open={listDialogOpen && canManageSelectedDepartment} onOpenChange={setListDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah List</DialogTitle>
            <DialogDescription>List akan dibuat untuk department yang sedang dipilih.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
              Nama List
            </label>
            <Input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Misal: To Do"
              className="mt-2 h-11 rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createList();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListDialogOpen(false)}>Batal</Button>
            <Button onClick={createList} disabled={!newListName.trim()}>Simpan List</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen && canManageSelectedDepartment} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Kategori</DialogTitle>
            <DialogDescription>Kategori akan berlaku hanya untuk department yang sedang dipilih.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
              Nama Kategori
            </label>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Misal: Design"
              className="mt-2 h-11 rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createCategory();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Batal</Button>
            <Button onClick={createCategory} disabled={!newCategoryName.trim()}>Simpan Kategori</Button>
          </DialogFooter>

          {categories.length > 0 && (
            <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Kategori yang sudah ada
              </p>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950"
                  >
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {category.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                      onClick={() => deleteCategory(category.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {taskModalOpen && board && canManageSelectedDepartment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => !savingTask && closeTaskModal()} />
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{taskForm.id ? "Edit Task" : "Tambah Task"}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {taskForm.id ? "Perbarui task" : "Buat task baru"}
                    {taskFormListName ? (
                      <> di list <span className="font-semibold text-blue-600 dark:text-blue-300">{taskFormListName}</span></>
                    ) : null}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={closeTaskModal} disabled={savingTask}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[calc(92vh-80px)] space-y-6 overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Nama Task <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={taskForm.title}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Contoh: Review payroll Mei"
                    className="h-11 rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    List <span className="text-red-500">*</span>
                  </label>
                  <Select value={taskForm.listId} onValueChange={(value) => setTaskForm((prev) => ({ ...prev, listId: value }))}>
                    <SelectTrigger className="h-11 w-full rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950">
                      <SelectValue placeholder="Pilih list" />
                    </SelectTrigger>
                    <SelectContent>
                      {board.lists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
                  <div className="flex-1">
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Start Date</label>
                    <Input
                      type="date"
                      value={taskForm.startDate}
                      onChange={(e) =>
                        setTaskForm((prev) => {
                          const startDate = e.target.value;
                          const dueDate =
                            prev.dueDate && startDate && prev.dueDate < startDate
                              ? startDate
                              : prev.dueDate;

                          return { ...prev, startDate, dueDate };
                        })
                      }
                      className="h-11 rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950 dark:[color-scheme:dark]"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Due Date</label>
                    <Input
                      type="date"
                      min={taskForm.startDate || undefined}
                      value={taskForm.dueDate}
                      onChange={(e) => setTaskForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                      className="h-11 rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950 dark:[color-scheme:dark]"
                    />
                    {hasInvalidDueDate ? (
                      <p className="mt-2 text-xs font-medium text-red-500">
                        Tanggal jatuh tempo harus sama atau setelah tanggal mulai task.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Deskripsi</label>
                  <textarea
                    value={taskForm.description}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:ring-blue-950"
                    placeholder="Detail singkat task"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Pemohon / Divisi</label>
                    <Input
                      value={taskForm.requester}
                      onChange={(e) => setTaskForm((prev) => ({ ...prev, requester: e.target.value }))}
                      placeholder="Contoh: HRD"
                      className="h-11 rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Prioritas</label>
                    <Select
                      value={taskForm.priority || "NONE"}
                      onValueChange={(value) => setTaskForm((prev) => ({ ...prev, priority: value === "NONE" ? "" : value }))}
                    >
                      <SelectTrigger className="h-11 w-full rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950">
                        <SelectValue placeholder="Pilih prioritas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Tidak ditentukan</SelectItem>
                        {TASK_PRIORITIES.map((priority) => (
                          <SelectItem key={priority.value} value={priority.value}>{priority.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">PIC Pendukung</label>
                    <Input
                      value={taskForm.supportPic}
                      onChange={(e) => setTaskForm((prev) => ({ ...prev, supportPic: e.target.value }))}
                      placeholder="Contoh: PIC Server / CI-CD"
                      className="h-11 rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Tujuan</label>
                    <textarea
                      value={taskForm.objective}
                      onChange={(e) => setTaskForm((prev) => ({ ...prev, objective: e.target.value }))}
                      rows={3}
                      className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:ring-blue-950"
                      placeholder="Satu poin per baris"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Ruang Lingkup</label>
                    <textarea
                      value={taskForm.scope}
                      onChange={(e) => setTaskForm((prev) => ({ ...prev, scope: e.target.value }))}
                      rows={3}
                      className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:ring-blue-950"
                      placeholder="Satu poin per baris"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Kategori</label>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                    {categories.map((category) => {
                      const selected = taskForm.categoryIds.includes(category.id);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => toggleCategory(category.id)}
                          className={`rounded-full px-5 py-2 text-sm font-medium transition ${selected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"}`}
                        >
                          {category.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Members</label>
                  <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950">
                    {board.department.users.length > 0 ? board.department.users.map((member) => {
                      const selected = taskForm.memberIds.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => toggleMember(member.id)}
                          className={`flex items-center gap-2 rounded-full border px-3 py-2 transition-all ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"}`}
                        >
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${selected ? "bg-white text-blue-600" : "bg-blue-600 text-white"}`}>{member.name.slice(0, 2).toUpperCase()}</span>
                          <span className="max-w-[120px] truncate text-sm font-medium">{member.name}</span>
                        </button>
                      );
                    }) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada anggota aktif di department ini.</p>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Attachment</label>
                    <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                      <Button type="button" variant="outline" size="sm" onClick={openAttachmentPicker} className="h-9 w-full rounded-lg"><Plus className="h-4 w-4" />Upload File</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setTaskForm((prev) => ({ ...prev, attachments: [...prev.attachments, { name: "", url: "", type: "Link" }] }))} className="h-9 w-full rounded-lg"><Plus className="h-4 w-4" />Tambah Link</Button>
                    </div>
                  </div>
                  <input ref={attachmentFileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,.xls,.xlsx,.csv,.doc,.docx,.ppt,.pptx" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      const attachment = await uploadAttachmentFile(file);
                      setTaskForm((prev) => ({ ...prev, attachments: [...prev.attachments, { name: attachment.name, url: attachment.url, objectKey: attachment.objectKey, type: attachment.type }] }));
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "";
                      if (message) {
                        toast.error(message);
                      }
                    }
                  }} />
                  <div className="space-y-2">
                    {taskForm.attachments.length > 0 ? taskForm.attachments.map((attachment, index) => (
                      <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950 sm:grid-cols-[160px_1fr_110px_36px]">
                        <Input value={attachment.name} onChange={(e) => updateAttachment(index, "name", e.target.value)} placeholder="Nama file/link" className="h-10 rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
                        <Input value={attachment.url} onChange={(e) => updateAttachment(index, "url", e.target.value)} placeholder="https://... atau /uploads/file.pdf" className="h-10 rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
                        <Select value={attachment.type || "Link"} onValueChange={(value) => updateAttachment(index, "type", value)}>
                          <SelectTrigger className="h-10 w-full rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Link">Link</SelectItem>
                            <SelectItem value="PDF">PDF</SelectItem>
                            <SelectItem value="Foto">Foto</SelectItem>
                            <SelectItem value="File">File</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => window.open(attachment.url, "_blank", "noopener,noreferrer")} disabled={!attachment.url.trim()} className="h-10" title="View attachment">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeAttachmentFromDraft(index)} className="h-10 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20" title={attachment.objectKey ? "Hapus file" : "Hapus link"}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )) : <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Belum ada attachment.</div>}
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-gray-100 pt-5 dark:border-gray-800 sm:col-span-2">
                  <Button variant="outline" onClick={closeTaskModal} disabled={savingTask} className="h-10 rounded-lg px-5">Batal</Button>
                  <Button onClick={saveTask} disabled={savingTask || hasInvalidDueDate} className="h-10 rounded-lg bg-blue-600 px-5 text-white shadow-sm hover:bg-blue-700">
                    <Save className="h-4 w-4" />
                    {savingTask ? "Menyimpan..." : "Simpan Task"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Data</DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === "list" ? `Hapus list ${deleteTarget.list.name}?` : "Hapus task ini?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailTask)} onOpenChange={(open) => !open && closeTaskDetail()}>
        <DialogContent className="sm:max-w-2xl">
          {detailTask ? (
            <>
              <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0 pr-8">
                <div className="min-w-0 space-y-1.5">
                  <DialogTitle className="text-xl">{detailTask.title}</DialogTitle>
                  <DialogDescription>
                    {detailTask.ticketNumber ? `#${detailTask.ticketNumber} · ` : ""}
                    {detailTask.listName}
                    {detailTask.dueDate ? ` · Due ${formatDate(detailTask.dueDate)}` : ""}
                  </DialogDescription>
                </div>
                <Button variant="outline" size="sm" onClick={printTaskDetail} className="shrink-0">
                  <Printer className="h-4 w-4" />
                  Print A5
                </Button>
              </DialogHeader>

              <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
                {detailTask.description && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Deskripsi</p>
                    <p className="whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                      {detailTask.description}
                    </p>
                  </div>
                )}

                {detailTask.requesterEmail && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Data Pemohon</p>
                    <dl className="grid grid-cols-1 gap-3 rounded-lg border border-violet-100 bg-violet-50/60 p-3 text-sm dark:border-violet-900/50 dark:bg-violet-950/20 sm:grid-cols-2">
                      {[
                        ["Nama", detailTask.requester],
                        ["Email", detailTask.requesterEmail],
                        ["Divisi", detailTask.requesterDivision],
                        ["WhatsApp / Ext.", detailTask.requesterPhone],
                        ["Jenis Request", detailTask.requestType],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-xs text-gray-500">{label}</dt>
                          <dd className="break-words text-gray-800 dark:text-gray-200">{value || "-"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Start Date</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{formatDate(detailTask.startDate)}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Due Date</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{formatDate(detailTask.dueDate)}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Members</p>
                  <div className="flex flex-wrap gap-2">
                    {detailTask.members.length > 0 ? detailTask.members.map((member) => (
                      <span key={member.user.id} className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                        {member.user.name}
                      </span>
                    )) : (
                      <span className="text-sm text-gray-500">Belum ada member.</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Categories</p>
                  <div className="flex flex-wrap gap-2">
                    {detailTask.categories.length > 0 ? detailTask.categories.map(({ category }) => (
                      <span key={category.id} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        {category.name}
                      </span>
                    )) : (
                      <span className="text-sm text-gray-500">Belum ada kategori.</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Attachments</p>
                  <div className="space-y-2">
                    {detailTask.attachments.length > 0 ? detailTask.attachments.map((attachment, index) => (
                      <button
                        key={`${attachment.url}-${index}`}
                        type="button"
                        onClick={() => window.open(attachment.url, "_blank", "noopener,noreferrer")}
                        className="flex w-full items-center gap-3 overflow-hidden rounded-lg border border-gray-100 bg-gray-50 p-3 text-left transition hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-[10px] font-bold uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                          {(attachment.type || "File").slice(0, 4)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{attachment.name || "Attachment"}</p>
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{attachment.url}</p>
                        </div>
                      </button>
                    )) : (
                      <span className="text-sm text-gray-500">Belum ada attachment.</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
