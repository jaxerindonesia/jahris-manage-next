"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, Loader2, Mail, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaskPublicRequestSettingsDto } from "@/lib/dto/task-public-request";
import {
  disablePublicRequestLink,
  fetchPublicRequestSettings,
  generatePublicRequestLink,
  saveTenantMailConfig,
  type TenantMailConfigForm,
} from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  departmentName: string;
  onLinkGenerated: () => void;
};

const EMPTY_MAIL_FORM: TenantMailConfigForm = {
  host: "",
  port: "587",
  secure: false,
  username: "",
  password: "",
  fromName: "",
  fromEmail: "",
};

function toMailForm(settings: TaskPublicRequestSettingsDto): TenantMailConfigForm {
  const config = settings.mailConfig;
  if (!config) return EMPTY_MAIL_FORM;
  return {
    host: config.host,
    port: String(config.port),
    secure: config.secure,
    username: config.username,
    password: "",
    fromName: config.fromName || "",
    fromEmail: config.fromEmail,
  };
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function PublicRequestDialog({ open, onOpenChange, departmentId, departmentName, onLinkGenerated }: Props) {
  const [settings, setSettings] = useState<TaskPublicRequestSettingsDto | null>(null);
  const [mailForm, setMailForm] = useState<TenantMailConfigForm>(EMPTY_MAIL_FORM);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"generate" | "disable" | "mail" | null>(null);

  useEffect(() => {
    if (!open || !departmentId) return;
    let active = true;
    setLoading(true);
    fetchPublicRequestSettings(departmentId)
      .then((data) => {
        if (!active) return;
        setSettings(data);
        setMailForm(toMailForm(data));
      })
      .catch((error) => toast.error(errorMessage(error, "Gagal memuat pengaturan")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, departmentId]);

  const publicUrl =
    settings?.token && typeof window !== "undefined"
      ? `${window.location.origin}/request/${settings.token}`
      : "";

  const applySettings = (data: TaskPublicRequestSettingsDto) => {
    setSettings(data);
    setMailForm(toMailForm(data));
  };

  const handleGenerate = async () => {
    if (settings?.enabled && !window.confirm("Generate ulang akan membuat link lama tidak berlaku. Lanjutkan?")) return;
    setBusy("generate");
    try {
      applySettings(await generatePublicRequestLink(departmentId));
      onLinkGenerated();
      toast.success("Link publik berhasil dibuat");
    } catch (error) {
      toast.error(errorMessage(error, "Gagal membuat link publik"));
    } finally {
      setBusy(null);
    }
  };

  const handleDisable = async () => {
    if (!window.confirm("Nonaktifkan link publik? Form tidak bisa diakses lagi sampai di-generate ulang.")) return;
    setBusy("disable");
    try {
      applySettings(await disablePublicRequestLink(departmentId));
      toast.success("Link publik dinonaktifkan");
    } catch (error) {
      toast.error(errorMessage(error, "Gagal menonaktifkan link"));
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link disalin");
    } catch {
      toast.error("Gagal menyalin link");
    }
  };

  const handleSaveMail = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("mail");
    try {
      applySettings(await saveTenantMailConfig(departmentId, mailForm));
      toast.success("Pengaturan email disimpan");
    } catch (error) {
      toast.error(errorMessage(error, "Gagal menyimpan pengaturan email"));
    } finally {
      setBusy(null);
    }
  };

  const updateMail = <K extends keyof TenantMailConfigForm>(key: K, value: TenantMailConfigForm[K]) =>
    setMailForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>API Publik Request - {departmentName}</DialogTitle>
          <DialogDescription>
            Bagikan link ini agar siapa pun bisa mengirim request tanpa login. Request yang masuk akan tampil di list
            Antrian Request.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <Link2 className="h-4 w-4" />
                Link Form Publik
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    settings?.enabled
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {settings?.enabled ? "Aktif" : "Belum aktif"}
                </span>
              </div>

              {publicUrl && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={publicUrl} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleCopy} title="Salin link">
                      <Copy className="h-4 w-4" />
                      Salin
                    </Button>
                    <Button type="button" variant="outline" asChild title="Buka form">
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400">
                ID perusahaan dan department dienkripsi di dalam link. Generate ulang akan membuat link lama tidak
                berlaku.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={busy !== null}
                  className="bg-violet-600 text-white hover:bg-violet-700"
                >
                  {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {settings?.enabled ? "Generate Ulang" : "Generate Link"}
                </Button>
                {settings?.enabled && (
                  <Button type="button" variant="outline" onClick={handleDisable} disabled={busy !== null}>
                    Nonaktifkan
                  </Button>
                )}
              </div>
            </section>

            <form onSubmit={handleSaveMail} className="space-y-3 border-t border-gray-200 pt-5 dark:border-gray-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <Mail className="h-4 w-4" />
                  Email Pengirim Perusahaan (SMTP)
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Dipakai untuk mengirim email konfirmasi ke pengirim request. Berlaku untuk seluruh perusahaan ini.
                  {!settings?.mailConfig && " Belum diatur, jadi email konfirmasi belum terkirim."}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-host">SMTP Host</Label>
                  <Input id="smtp-host" required placeholder="smtp.gmail.com" value={mailForm.host} onChange={(e) => updateMail("host", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input id="smtp-port" required inputMode="numeric" value={mailForm.port} onChange={(e) => updateMail("port", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Keamanan</Label>
                    <Select value={mailForm.secure ? "ssl" : "tls"} onValueChange={(value) => updateMail("secure", value === "ssl")}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tls">STARTTLS (587)</SelectItem>
                        <SelectItem value="ssl">SSL/TLS (465)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-username">Username</Label>
                  <Input id="smtp-username" required autoComplete="off" value={mailForm.username} onChange={(e) => updateMail("username", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-password">Password / App Password</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    autoComplete="new-password"
                    required={!settings?.mailConfig?.hasPassword}
                    placeholder={settings?.mailConfig?.hasPassword ? "Kosongkan jika tidak diubah" : ""}
                    value={mailForm.password}
                    onChange={(e) => updateMail("password", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-from-name">Nama Pengirim</Label>
                  <Input id="smtp-from-name" placeholder="IT Support" value={mailForm.fromName} onChange={(e) => updateMail("fromName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-from-email">Email Pengirim</Label>
                  <Input id="smtp-from-email" type="email" required value={mailForm.fromEmail} onChange={(e) => updateMail("fromEmail", e.target.value)} />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={busy !== null} className="bg-blue-600 text-white hover:bg-blue-700">
                  {busy === "mail" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Simpan Email
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
