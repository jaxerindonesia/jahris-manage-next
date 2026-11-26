import { useEffect, useState } from "react";
import { DepartmentDto } from "@/lib/dto/department";
import type { BranchDto } from "@/lib/dto/branch";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { parseApiError } from "@/lib/helper/response-api";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function DepartmentModal({
  isOpen,
  onClose,
  departments,
  branches,
  onRefresh,
}: {
  isOpen: boolean;
  onClose: () => void;
  departments: DepartmentDto[];
  branches: BranchDto[];
  onRefresh: () => void;
}) {
  const [newType, setNewType] = useState("");
  const [newCode, setNewCode] = useState("");
  const [branchId, setBranchId] = useState("none");
  const [loading, setLoading] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const getDepartmentLabel = (dept: DepartmentDto) => {
    if (!isSuperAdmin) return dept.name;
    const companyName = dept.tenant?.companyName || "";
    return companyName ? `${dept.name} - ${companyName}` : dept.name;
  };

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newType.trim()) return;

    try {
      setLoading(true);

      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newType.trim(),
          code: newCode.trim() || null,
          branchId: branchId === "none" ? null : branchId,
          tenantId: branchId === "none"
            ? null
            : branches.find((branch) => branch.id === branchId)?.tenantId,
        }),
      });

      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal menambahkan departemen"),
        );
      }

      toast.success("Departemen berhasil ditambahkan");
      setNewType("");
      setNewCode("");
      setBranchId("none");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCode = async (dept: DepartmentDto, rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (code === (dept.code || "")) return;

    try {
      const res = await fetch(`/api/departments/${dept.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code || null }),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res, "Gagal mengubah kode departemen"));
      }

      toast.success("Kode departemen berhasil diubah");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah kode departemen");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/departments/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal menghapus departemen"),
        );
      }

      toast.success("Departemen berhasil dihapus");

      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menghapus departemen",
      );
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem("hr_user_data");
    if (raw) {
      try {
        const userData = JSON.parse(raw);
        const rawRoleName =
          typeof userData?.role === "string" ? userData.role : userData?.role?.name;
        const roleName = String(rawRoleName || "").toLowerCase().replace(/\s/g, "");
        setIsSuperAdmin(roleName === "superadmin");
      } catch {
        setIsSuperAdmin(false);
      }
    }
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Kelola Departemen
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddType} className="space-y-4">
          <div className="grid gap-2">
            <Label>Cabang (opsional) <p className="text-xs text-muted-foreground">Kosongkan jika departemen berlaku umum.</p></Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Pilih Cabang" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Tanpa cabang</SelectItem>
                {branches.filter((branch) => branch.isActive).map((branch) => (
                  <SelectItem key={branch.id} value={branch.id || ""}>
                    {isSuperAdmin && branch.tenant?.companyName
                      ? `${branch.name} - ${branch.tenant.companyName}`
                      : branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="Tambah departemen baru..."
            />
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="Kode (IT)"
              maxLength={6}
              className="w-28 uppercase"
            />
            <Button type="submit" disabled={!newType.trim() || loading}>
              Tambah
            </Button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {departments.map((dept) => (
              <div
                key={dept.id}
                className="flex items-center justify-between p-2 border rounded-md"
              >
                <div>
                  <p className="text-sm">{getDepartmentLabel(dept)}</p>
                  <p className="text-xs text-muted-foreground">{dept.branch?.name || "Tanpa cabang"}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    key={`${dept.id}-${dept.code ?? ""}`}
                    defaultValue={dept.code || ""}
                    onBlur={(e) => handleUpdateCode(dept, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="Kode"
                    title="Kode departemen untuk nomor tiket task"
                    maxLength={6}
                    className="h-8 w-24 uppercase"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(dept.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            {departments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">
                Belum ada departemen
              </p>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
