"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_ATTACHMENT_EXTENSIONS, TASK_ATTACHMENT_MAX_SIZE } from "@/lib/helper/attachment";
import type {
  TaskPublicRequestFormDto,
  TaskPublicRequestResultDto,
} from "@/lib/dto/task-public-request";
import { submitPublicRequest } from "../actions";
import { EMPTY_PUBLIC_REQUEST_FORM, type PublicRequestForm } from "../types";

type Props = {
  token: string;
  options: TaskPublicRequestFormDto;
  onSubmitted: (result: TaskPublicRequestResultDto) => void;
};

function Field({
  label,
  hint,
  required,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="space-y-1">
        <Label htmlFor={htmlFor} className="text-sm font-semibold text-gray-900 dark:text-white">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </Label>
        {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function PublicRequestFormData({ token, options, onSubmitted }: Props) {
  const [form, setForm] = useState<PublicRequestForm>(EMPTY_PUBLIC_REQUEST_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (key: keyof PublicRequestForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    const tooLarge = Array.from(selected).find((file) => file.size > TASK_ATTACHMENT_MAX_SIZE);
    if (tooLarge) {
      setError(`${tooLarge.name} melebihi 10 MB`);
      return;
    }
    setError("");
    setFiles((prev) => [...prev, ...Array.from(selected)].slice(0, options.maxFiles));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.division || !form.requestType || !form.priority) {
      setError("Divisi, jenis request, dan prioritas wajib dipilih");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      onSubmitted(await submitPublicRequest(token, form, files));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal mengirim request");
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Email" required htmlFor="email" hint="Konfirmasi dan nomor tiket akan dikirim ke email ini">
        <Input id="email" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="nama@perusahaan.com" />
      </Field>

      <Field label="Nama lengkap" required htmlFor="name">
        <Input id="name" required maxLength={200} value={form.name} onChange={(e) => update("name", e.target.value)} />
      </Field>

      <Field label="Divisi" required>
        <Select value={form.division} onValueChange={(value) => update("division", value)}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Pilih divisi" />
          </SelectTrigger>
          <SelectContent>
            {options.divisions.map((division) => (
              <SelectItem key={division} value={division}>{division}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="No. WhatsApp / Ext." htmlFor="phone">
        <Input id="phone" inputMode="tel" maxLength={50} value={form.phone} onChange={(e) => update("phone", e.target.value)} />
      </Field>

      <Field label="Jenis request" required>
        <Select value={form.requestType} onValueChange={(value) => update("requestType", value)}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder="Pilih jenis request" />
          </SelectTrigger>
          <SelectContent>
            {options.requestTypes.map((type) => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Judul request" required htmlFor="title" hint="Singkat, contoh: Printer lantai 2 tidak bisa print">
        <Input id="title" required maxLength={200} value={form.title} onChange={(e) => update("title", e.target.value)} />
      </Field>

      <Field label="Deskripsi kebutuhan / masalah" required htmlFor="description" hint="Jelaskan apa yang terjadi, sejak kapan, dan hasil yang diharapkan">
        <Textarea id="description" required rows={5} maxLength={5000} value={form.description} onChange={(e) => update("description", e.target.value)} />
      </Field>

      <Field
        label="Upload dokumen pendukung (opsional)"
        hint={`Contoh: screenshot error, memo, SPK. Maksimal ${options.maxFiles} file, 10 MB per file.`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept={TASK_ATTACHMENT_EXTENSIONS.join(",")}
          onChange={(e) => addFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={files.length >= options.maxFiles}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
          Tambah File
        </Button>
        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900">
                <span className="truncate text-gray-700 dark:text-gray-300">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title="Hapus file"
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="Prioritas" required>
        <div role="radiogroup" className="space-y-2">
          {options.priorities.map((priority) => (
            <label key={priority.value} className="flex cursor-pointer items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="priority"
                value={priority.value}
                checked={form.priority === priority.value}
                onChange={(e) => update("priority", e.target.value)}
                className="h-4 w-4 accent-blue-600"
              />
              <span>
                <span className="font-medium">{priority.label}</span> - {priority.hint}
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Tanggal dibutuhkan" htmlFor="neededDate">
        <Input id="neededDate" type="date" min={minDate} className="w-full sm:w-56" value={form.neededDate} onChange={(e) => update("neededDate", e.target.value)} />
      </Field>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={submitting}
          onClick={() => {
            setForm(EMPTY_PUBLIC_REQUEST_FORM);
            setFiles([]);
            setError("");
          }}
        >
          Kosongkan form
        </Button>
        <Button type="submit" disabled={submitting} className="bg-blue-600 text-white hover:bg-blue-700">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? "Mengirim..." : "Kirim Request"}
        </Button>
      </div>
    </form>
  );
}
