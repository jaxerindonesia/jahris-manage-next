"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { OvertimeDto } from "@/lib/dto/overtime";
import { toast } from "sonner";

const MAX_PROOF_FILE_SIZE = 3 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export default function CheckoutModal({
  isOpen,
  overtime,
  loading,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  overtime?: OvertimeDto;
  loading: boolean;
  onClose: () => void;
  onSubmit: (file: File | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_PROOF_FILE_SIZE) {
      const message = "Ukuran file bukti maksimal 3MB";
      setFileError(message);
      toast.error(message);
      event.target.value = "";
      return;
    }

    if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
      const message = "Format file tidak didukung";
      setFileError(message);
      toast.error(message);
      event.target.value = "";
      return;
    }

    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setFileError("");
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
      return;
    }
    setPreviewUrl("pdf");
  };

  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const removeFile = () => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    removeFile();
    onClose();
  };

  const isPdf = previewUrl === "pdf";
  const handleSubmit = () => {
    if (selectedFile && selectedFile.size > MAX_PROOF_FILE_SIZE) {
      const message = "Ukuran file bukti maksimal 3MB";
      setFileError(message);
      toast.error(message);
      return;
    }

    onSubmit(selectedFile);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Check Out Lembur</DialogTitle>
          <DialogDescription>
            Upload bukti lembur sebelum melakukan check out.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
            <p className="font-medium">{overtime?.description || "Pengajuan lembur"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tanggal lembur: {overtime?.overtimeDate ? new Date(overtime.overtimeDate).toLocaleDateString("id-ID") : "-"}
            </p>
          </div>

          <div className="grid gap-3">
            <Label>Bukti Lembur</Label>

            {!previewUrl ? (
              <button
                type="button"
                onClick={openFilePicker}
                className="flex h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed"
              >
                <Upload className="h-6 w-6 text-gray-500" />
                <p className="text-sm text-gray-500">
                  JPG, PNG, PDF (Maks. 3MB)
                </p>
                <p className="text-center text-xs text-gray-400">
                  Upload foto saat lembur atau lampirkan file hasil pekerjaan lembur.
                </p>
              </button>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border">
                {!isPdf ? (
                  <img
                    src={previewUrl}
                    alt="Preview bukti lembur"
                    className="max-h-64 w-full object-contain p-4"
                  />
                ) : (
                  <div className="flex items-center gap-4 p-6">
                    <FileText className="h-8 w-8 text-red-500" />
                    <p className="text-sm font-semibold">
                      {selectedFile?.name || "Dokumen PDF siap dikirim"}
                    </p>
                  </div>
                )}

                <div className="flex justify-between bg-gray-50 p-4 dark:bg-slate-900/40">
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="text-xs"
                  >
                    Ganti File
                  </button>

                  <button
                    type="button"
                    onClick={removeFile}
                    className="text-xs text-red-500"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            )}

            {fileError ? (
              <p className="text-sm font-medium text-red-500">{fileError}</p>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 border-t pt-6">
            <Button type="button" variant="outline" onClick={handleClose}>
              Batal
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
            >
              {loading ? "Memproses..." : "Lanjut Check Out"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
