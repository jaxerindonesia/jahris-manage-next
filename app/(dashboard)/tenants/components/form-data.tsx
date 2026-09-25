import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDataProps, FormState } from "../page.config";

function createInitialFormState(initialData?: FormDataProps["initialData"]): FormState {
  return {
    companyName: initialData?.companyName || "",
    adminEmail: initialData?.adminEmail || "",
    isActive: initialData?.isActive ?? true,
    logoUrl: initialData?.logoUrl ?? null,
    logoDarkUrl: initialData?.logoDarkUrl ?? null,
    subscriptionStart: initialData?.subscriptionStart
      ? new Date(initialData.subscriptionStart).toISOString().slice(0, 10)
      : "",
    subscriptionEnd: initialData?.subscriptionEnd
      ? new Date(initialData.subscriptionEnd).toISOString().slice(0, 10)
      : "",
  };
}

export default function FormData({
  isOpen,
  initialData,
  onClose,
  onSuccess,
}: FormDataProps) {
  const [loading, setLoading] = useState(false);
  const [imageLightBase64, setImageLightBase64] = useState<string | null>(null);
  const [imageDarkBase64, setImageDarkBase64] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => createInitialFormState(initialData));

  useEffect(() => {
    if (!isOpen) return;

    setForm(createInitialFormState(initialData));
    setImageLightBase64(null);
    setImageDarkBase64(null);
  }, [initialData, isOpen]);

  const previewLightUrl = useMemo(
    () => imageLightBase64 || form.logoUrl || null,
    [imageLightBase64, form.logoUrl],
  );
  const previewDarkUrl = useMemo(
    () => imageDarkBase64 || form.logoDarkUrl || null,
    [imageDarkBase64, form.logoDarkUrl],
  );

  const handleFile = (file: File, type: "light" | "dark") => {
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (type === "light") setImageLightBase64(base64);
      else setImageDarkBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const uploadLogoIfNeeded = async () => {
    let logoUrl = form.logoUrl;
    let logoDarkUrl = form.logoDarkUrl;

    if (imageLightBase64) {
      const uploadRes = await fetch("/api/tenant-config/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imageLightBase64 }),
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.message || "Upload logo terang gagal");
      logoUrl = uploadJson.url;
    }

    if (imageDarkBase64) {
      const uploadRes = await fetch("/api/tenant-config/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imageDarkBase64 }),
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.message || "Upload logo gelap gagal");
      logoDarkUrl = uploadJson.url;
    }

    return { logoUrl, logoDarkUrl };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { logoUrl, logoDarkUrl } = await uploadLogoIfNeeded();
      const url = initialData?.id ? `/api/tenants/${initialData.id}` : "/api/tenants";
      const method = initialData?.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          logoUrl,
          logoDarkUrl,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal menyimpan tenant");

      toast.success(initialData?.id ? "Tenant berhasil diupdate" : "Tenant berhasil ditambahkan");
      await onSuccess();
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Gagal menyimpan tenant";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? "Edit Tenant" : "Tambah Tenant"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nama Perusahaan</Label>
            <Input
              value={form.companyName}
              onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Email Admin</Label>
            <Input
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm((prev) => ({ ...prev, adminEmail: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.isActive ? "active" : "inactive"}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, isActive: value === "active" }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Logo Tema Terang</Label>
              <div className="rounded-lg border border-dashed dark:border-gray-600 p-3 space-y-2">
                {previewLightUrl ? (
                  <div className="rounded-md border dark:border-gray-700 bg-white p-2 flex justify-center">
                    <Image
                      src={previewLightUrl}
                      alt="Logo terang"
                      width={120}
                      height={36}
                      className="h-9 w-auto object-contain"
                      unoptimized
                    />
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Belum ada logo</p>
                )}
                <label className="inline-flex items-center gap-2 text-xs text-blue-600 cursor-pointer">
                  <Upload className="w-3 h-3" /> Upload Logo Terang
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file, "light");
                    }}
                  />
                </label>
                {previewLightUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageLightBase64(null);
                      setForm((prev) => ({ ...prev, logoUrl: null }));
                    }}
                    className="text-xs text-red-500"
                  >
                    Hapus Logo Terang
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Logo Tema Gelap</Label>
              <div className="rounded-lg border border-dashed dark:border-gray-600 p-3 space-y-2">
                {previewDarkUrl ? (
                  <div className="rounded-md border dark:border-gray-700 bg-gray-900 p-2 flex justify-center">
                    <Image
                      src={previewDarkUrl}
                      alt="Logo gelap"
                      width={120}
                      height={36}
                      className="h-9 w-auto object-contain"
                      unoptimized
                    />
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Belum ada logo</p>
                )}
                <label className="inline-flex items-center gap-2 text-xs text-blue-600 cursor-pointer">
                  <Upload className="w-3 h-3" /> Upload Logo Gelap
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file, "dark");
                    }}
                  />
                </label>
                {previewDarkUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageDarkBase64(null);
                      setForm((prev) => ({ ...prev, logoDarkUrl: null }));
                    }}
                    className="text-xs text-red-500"
                  >
                    Hapus Logo Gelap
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tanggal Berlangganan</Label>
              <Input
                type="date"
                value={form.subscriptionStart}
                onChange={(e) => setForm((prev) => ({ ...prev, subscriptionStart: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Akhir Langganan</Label>
              <Input
                type="date"
                value={form.subscriptionEnd}
                onChange={(e) => setForm((prev) => ({ ...prev, subscriptionEnd: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : initialData?.id ? "Update" : "Simpan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
