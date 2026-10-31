"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OvertimeConfigDto } from "@/lib/dto/overtime";
import { formatNumberInput } from "@/lib/helper/date";

type UserItem = {
    id: string;
    name: string;
    email?: string | null;
};

interface ConfigModalProps {
    open: boolean;
    users: UserItem[];
    approverUserIds: string[];
    config: OvertimeConfigDto;
    onAddApprover: (userId: string) => void;
    onClose: () => void;
    onDailyRateChange: (value: number) => void;
    onHourlyRateChange: (value: number) => void;
    onHideNominalChange: (value: boolean) => void;
    onRemoveApprover: (userId: string) => void;
    onSave: () => void;
}

export default function ConfigModal({
    open,
    users,
    approverUserIds,
    config,
    onAddApprover,
    onClose,
    onDailyRateChange,
    onHourlyRateChange,
    onHideNominalChange,
    onRemoveApprover,
    onSave,
}: ConfigModalProps) {
    const [selectedApproverId, setSelectedApproverId] = useState("");

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Kelola Tarif Lembur</DialogTitle>
                    <DialogDescription>
                        Atur approver dan tarif lembur.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-5 py-2">
                    <div className="grid gap-2">
                        <Label>Pemberi Persetujuan (dapat dipilih lebih dari satu)</Label>
                        <p className="text-xs text-muted-foreground">
                            Pilih satu atau beberapa approver. Semua approver harus menyetujui agar lembur menjadi disetujui.
                        </p>
                        <Select
                            value={selectedApproverId}
                            onValueChange={(value) => {
                                onAddApprover(value);
                                setSelectedApproverId("");
                            }}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Pilih approver..." />
                            </SelectTrigger>
                            <SelectContent>
                                {users
                                    .filter((user) => !approverUserIds.includes(user.id))
                                    .map((user) => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.name}
                                            {user.email ? ` (${user.email})` : ""}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>

                        <div className="flex flex-wrap gap-2">
                            {approverUserIds.map((id) => {
                                const user = users.find((item) => item.id === id);
                                return (
                                    <span
                                        key={id}
                                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                    >
                                        {user?.name || "Approver"}
                                        {user?.email ? ` (${user.email})` : ""}
                                        <button
                                            type="button"
                                            onClick={() => onRemoveApprover(id)}
                                            className="hover:text-blue-900 dark:hover:text-blue-100"
                                            aria-label={`Hapus ${user?.name || "Approver"}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    <hr className="border-gray-200 dark:border-gray-700" />

                    <div className="grid gap-2">
                        <Label>Tarif / Jam</Label>
                        <Input
                            type="text"
                            inputMode="numeric"
                            value={formatNumberInput(config.hourlyRate)}
                            onChange={(event) => onHourlyRateChange(Number(event.target.value.replace(/\D/g, "")) || 0)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>Tarif / Hari</Label>
                        <Input
                            type="text"
                            inputMode="numeric"
                            value={formatNumberInput(config.dailyRate)}
                            onChange={(event) => onDailyRateChange(Number(event.target.value.replace(/\D/g, "")) || 0)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Approval terakhir akan memilih metode Per Jam atau Per Hari memakai tarif ini.
                        </p>
                    </div>

                    <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                        <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-blue-600"
                            checked={Boolean(config.hideNominal)}
                            onChange={(event) => onHideNominalChange(event.target.checked)}
                        />
                        <span className="grid gap-1">
                            <span className="text-sm font-medium">Sembunyikan nominal dari karyawan</span>
                            <span className="text-xs text-muted-foreground">
                                Nominal lembur hanya dapat dilihat oleh role selain Karyawan.
                            </span>
                        </span>
                    </label>
                </div>

                <hr className="border-gray-200 dark:border-gray-700" />

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>
                        Batal
                    </Button>
                    <Button onClick={onSave}>Simpan Konfigurasi</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
