"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserDto } from "@/lib/dto/user";
import type { RoleDto } from "@/lib/dto/role";
import type { DepartmentDto } from "@/lib/dto/department";
import type { BranchDto } from "@/lib/dto/branch";
import { parseApiError } from "@/lib/helper/response-api";
import FaceCapture from "./face-capture";
import { getMaxJoinDateInputValue, MIN_JOIN_DATE } from "@/lib/helper/join-date";

type TenantDto = {
  id: string;
  companyName: string;
};

const INITIAL_FORM_DATA: UserDto = {
  roleId: "",
  departmentId: "",
  branchId: "",
  department: null,
  nik: "",
  name: "",
  email: "",
  phone: "",
  position: "",
  joinDate: "",
  salary: 0,
  salaryType: "monthly",
  status: "active",
  password: "",
  avatarUrl: "",
  tenantId: "",
  gender: "",
  address: "",
  birthDate: "",
  birthPlace: "",
};

function getPasswordValidationMessage(password: string) {
  if (password.length < 8) {
    return "Password minimal 8 karakter";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password harus mengandung minimal 1 huruf besar";
  }
  if (!/[a-z]/.test(password)) {
    return "Password harus mengandung minimal 1 huruf kecil";
  }
  if (!/\d/.test(password)) {
    return "Password harus mengandung minimal 1 angka";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password harus mengandung minimal 1 karakter khusus";
  }
  return null;
}

function getPasswordChecks(password: string) {
  return [
    {
      label: "Minimal 8 karakter",
      passed: password.length >= 8,
    },
    {
      label: "Minimal 1 huruf besar",
      passed: /[A-Z]/.test(password),
    },
    {
      label: "Minimal 1 huruf kecil",
      passed: /[a-z]/.test(password),
    },
    {
      label: "Minimal 1 angka",
      passed: /\d/.test(password),
    },
    {
      label: "Minimal 1 karakter khusus",
      passed: /[^A-Za-z0-9]/.test(password),
    },
  ];
}

export default function FormData({
  isOpen,
  initialData,
  departments,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  initialData?: UserDto;
  departments: DepartmentDto[];
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [rePassword, setRePassword] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentTenantId, setCurrentTenantId] = useState("");
  const [changePassword, setChangePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [faceDataUrl, setFaceDataUrl] = useState<string | null>(
    initialData?.avatarUrl || null,
  );
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(
    initialData?.faceDescriptor || null,
  );
  const [formData, setFormData] = useState<UserDto>(
    initialData || INITIAL_FORM_DATA,
  );

  const fetchRoles = async () => {
    try {
      const res = await fetch("/api/roles");
      if (!res.ok) {
        throw new Error(await parseApiError(res, "Gagal mengambil data role"));
      }
      const json = await res.json();
      setRoles(json.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat role");
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await fetch("/api/tenants?page=1&limit=100");
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data tenant"),
        );
      }
      const json = await res.json();
      setTenants(json.data || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat tenant",
      );
    }
  };

  const handleSubmit = async () => {
    setLoading(true);

    if ((!formData.id && !formData.password) || (!formData.id && !rePassword)) {
      toast.error("Password dan konfirmasi password wajib diisi");
      setLoading(false);
      return;
    }

    if (!formData.id && formData.password !== rePassword) {
      toast.error("Password dan konfirmasi password tidak sama");
      setLoading(false);
      return;
    }

    if (!formData.id) {
      const passwordValidationMessage = getPasswordValidationMessage(
        formData.password || "",
      );
      if (passwordValidationMessage) {
        toast.error(passwordValidationMessage);
        setLoading(false);
        return;
      }
    }

    if (formData.id && changePassword) {
      if (!formData.password) {
        toast.error("Password baru wajib diisi");
        setLoading(false);
        return;
      }
      if (formData.password !== rePassword) {
        toast.error("Password baru dan konfirmasi password tidak sama");
        setLoading(false);
        return;
      }
      const passwordValidationMessage = getPasswordValidationMessage(
        formData.password,
      );
      if (passwordValidationMessage) {
        toast.error(passwordValidationMessage);
        setLoading(false);
        return;
      }
    }

    try {
      let avatarUrl = formData.avatarUrl || "";
      if (faceDataUrl && faceDataUrl.startsWith("data:image")) {
        const uploadRes = await fetch("/api/upload-avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: faceDataUrl }),
        });

        if (!uploadRes.ok) {
          toast.error(
            await parseApiError(uploadRes, "Gagal mengupload foto wajah"),
          );
          setLoading(false);
          return;
        }

        const uploadJson = await uploadRes.json();
        avatarUrl = uploadJson.url;
      }

      const url = formData.id ? `/api/users/${formData.id}` : "/api/users";
      const method = formData.id ? "PUT" : "POST";
      const finalTenantId = isSuperAdmin
        ? formData.tenantId || ""
        : currentTenantId;

      if (!finalTenantId) {
        toast.error("Tenant wajib dipilih");
        setLoading(false);
        return;
      }

      const payload = {
        ...formData,
        avatarUrl,
        faceDescriptor,
        tenantId: finalTenantId,
      };
      if (formData.id && !changePassword) {
        delete payload.password;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await parseApiError(res, "Gagal menyimpan data"));

      toast.success(
        `Data karyawan berhasil ${formData.id ? "diupdate" : "disimpan"}!`,
      );
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem("hr_user_data");
    if (raw) {
      try {
        const userData = JSON.parse(raw);
        const rawRoleName =
          typeof userData?.role === "string"
            ? userData.role
            : userData?.role?.name;
        const normalizedRole = String(rawRoleName || "")
          .toLowerCase()
          .replace(/\s/g, "");
        setIsSuperAdmin(normalizedRole === "superadmin");

        const userTenantId = userData?.tenantId || userData?.tenant_id || "";
        setCurrentTenantId(userTenantId);

        if (!initialData?.id && userTenantId) {
          setFormData((prev) => ({
            ...prev,
            tenantId: userTenantId,
          }));
        }

        if (initialData?.id && !userTenantId && initialData.tenantId) {
          setCurrentTenantId(initialData.tenantId);
        }
      } catch {
        setIsSuperAdmin(false);
        setCurrentTenantId("");
      }
    }

    fetchRoles();
  }, [initialData?.id, initialData?.tenantId]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTenants();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isOpen) {
      setChangePassword(false);
      setShowPassword(false);
      setShowConfirmPassword(false);
      setRePassword("");
      setFaceDataUrl(initialData?.avatarUrl || null);
      setFaceDescriptor(initialData?.faceDescriptor || null);
      setFormData(initialData || INITIAL_FORM_DATA);
      return;
    }

    setChangePassword(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setRePassword("");
    setFaceDataUrl(initialData?.avatarUrl || null);
    setFaceDescriptor(initialData?.faceDescriptor || null);
    setFormData(initialData || INITIAL_FORM_DATA);
  }, [initialData, isOpen]);

  const visibleRoles = roles.filter((role) => {
    if (isSuperAdmin) return true;
    const normalizedName = String(role.name || "")
      .toLowerCase()
      .replace(/\s/g, "");
    return normalizedName !== "superadmin";
  });

  const selectedTenantId = isSuperAdmin
    ? formData.tenantId || ""
    : currentTenantId || formData.tenantId || initialData?.tenantId || "";

  useEffect(() => {
    if (!isOpen || !selectedTenantId) { setBranches([]); return; }
    fetch(`/api/branches?page=1&limit=100&tenantId=${selectedTenantId}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((json) => setBranches(json.data || []))
      .catch(() => setBranches([]));
  }, [isOpen, selectedTenantId]);
  const passwordChecks = getPasswordChecks(formData.password || "");

  const filteredDepartments = departments.filter((department) => {
    if (!selectedTenantId) return false;
    return department.tenantId === selectedTenantId;
  });

  useEffect(() => {
    if (!formData.departmentId || departments.length === 0) return;

    const isDepartmentStillValid = filteredDepartments.some(
      (department) => department.id === formData.departmentId,
    );

    if (!isDepartmentStillValid) {
      setFormData((prev) => ({
        ...prev,
        departmentId: "",
      }));
    }
  }, [departments, filteredDepartments, formData.departmentId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto p-4 sm:w-[92vw] sm:max-w-[960px] sm:p-6 lg:w-[72vw] lg:max-w-[1080px]">
        <DialogHeader>
          <DialogTitle>
            {formData.id ? "Edit Karyawan" : "Tambah Karyawan"}
          </DialogTitle>
          <DialogDescription>
            Lengkapi data karyawan sesuai informasi master perusahaan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isSuperAdmin ? (
            <div className="grid gap-2">
              <Label>Tenant *</Label>
              <Select
                value={formData.tenantId || ""}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    tenantId: value,
                    departmentId: "",
                    branchId: "",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih Tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label>Role *</Label>
              <Select
                value={formData.roleId || ""}
                onValueChange={(value) =>
                  setFormData((current) => ({ ...current, roleId: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih Role" />
                </SelectTrigger>
                <SelectContent>
                  {visibleRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id ?? ""}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Departemen *</Label>
              <Select
                value={formData.departmentId || ""}
                onValueChange={(value) =>
                  setFormData((current) => ({ ...current, departmentId: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih Departemen" />
                </SelectTrigger>
                <SelectContent>
                  {filteredDepartments.map((department) => (
                    <SelectItem key={department.id} value={department.id ?? ""}>
                      {isSuperAdmin
                        ? `${department.name} - ${department.tenant?.companyName || "-"}`
                        : department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Cabang</Label>
              <Select value={formData.branchId || "none"} onValueChange={(value) => setFormData((current) => ({ ...current, branchId: value === "none" ? "" : value }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Pilih Cabang" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Belum ditentukan</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id || ""}>{branch.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label>NIK</Label>
              <Input
                value={formData.nik || ""}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    nik: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label>Nama Lengkap *</Label>
              <Input
                value={formData.name}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="grid gap-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label>No. Telepon *</Label>
              <Input
                value={formData.phone || ""}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Posisi *</Label>
              <Input
                value={formData.position || ""}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    position: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Tanggal Bergabung *</Label>
              <Input
                type="date"
                value={formData.joinDate ? formData.joinDate.split("T")[0] : ""}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    joinDate: event.target.value,
                  }))
                }
                min={MIN_JOIN_DATE}
                max={getMaxJoinDateInputValue()}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label>Gender</Label>
              <Select
                value={formData.gender || "unspecified"}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    gender: value === "unspecified" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unspecified">Belum diisi</SelectItem>
                  <SelectItem value="male">Laki-laki</SelectItem>
                  <SelectItem value="female">Perempuan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Tempat Lahir</Label>
              <Input
                value={formData.birthPlace || ""}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    birthPlace: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Tanggal Lahir</Label>
              <Input
                type="date"
                value={formData.birthDate ? formData.birthDate.split("T")[0] : ""}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    birthDate: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label>Jenis Pembayaran Gaji *</Label>
              <Select
                value={formData.salaryType || "monthly"}
                onValueChange={(value: "daily" | "monthly") =>
                  setFormData((current) => ({
                    ...current,
                    salaryType: value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih jenis pembayaran" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Harian</SelectItem>
                  <SelectItem value="monthly">Bulanan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Gaji {formData.salaryType == "monthly" ? 'Bulanan' : 'Harian'}</Label>
              <Input
                type="text"
                disabled={!formData.salaryType}
                value={formData.salary ? formData.salary.toLocaleString("id-ID") : ""}
                onChange={(event) => {
                  const numericValue = event.target.value.replace(/\D/g, "");
                  setFormData((current) => ({
                    ...current,
                    salary: numericValue ? Number(numericValue) : 0,
                  }));
                }}
                placeholder="0"
              />
            </div>

            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    status: value as "active" | "inactive",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Tidak Aktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Alamat</Label>
            <Textarea
              value={formData.address || ""}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  address: event.target.value,
                }))
              }
              rows={4}
            />
          </div>

          <div className="grid gap-2">
            <Label>Foto Wajah (untuk absensi)</Label>
            <FaceCapture
              value={faceDataUrl}
              onChange={(dataUrl, descriptor) => {
                setFaceDataUrl(dataUrl);
                setFaceDescriptor(descriptor);
              }}
            />
          </div>

          {!formData.id ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Password *</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={formData.password || ""}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      className="pr-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      aria-label={
                        showPassword ? "Sembunyikan password" : "Lihat password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Konfirmasi Password *</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={rePassword}
                      onChange={(event) => setRePassword(event.target.value)}
                      className="pr-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword((current) => !current)
                      }
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      aria-label={
                        showConfirmPassword
                          ? "Sembunyikan konfirmasi password"
                          : "Lihat konfirmasi password"
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                  Syarat password
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {passwordChecks.map((check) => (
                    <p
                      key={check.label}
                      className={`text-sm ${check.passed
                        ? "text-green-600 dark:text-green-400"
                        : "text-slate-500 dark:text-slate-400"
                        }`}
                    >
                      {check.passed ? "✓" : "•"} {check.label}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50">
                <div className="space-y-1">
                  <Label>Ganti Password</Label>
                  <p className="text-xs text-muted-foreground">
                    Aktifkan jika password karyawan perlu diperbarui.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={changePassword ? "default" : "outline"}
                  onClick={() => {
                    const nextValue = !changePassword;
                    setChangePassword(nextValue);
                    if (!nextValue) {
                      setFormData((current) => ({
                        ...current,
                        password: "",
                      }));
                      setShowPassword(false);
                      setShowConfirmPassword(false);
                      setRePassword("");
                    }
                  }}
                >
                  {changePassword ? "Batalkan" : "Aktifkan"}
                </Button>
              </div>

              {changePassword ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Password Baru *</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={formData.password || ""}
                          onChange={(event) =>
                            setFormData((current) => ({
                              ...current,
                              password: event.target.value,
                            }))
                          }
                          placeholder="Password baru"
                          className="pr-11"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((current) => !current)}
                          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          aria-label={
                            showPassword
                              ? "Sembunyikan password baru"
                              : "Lihat password baru"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Konfirmasi Password Baru *</Label>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          value={rePassword}
                          onChange={(event) => setRePassword(event.target.value)}
                          placeholder="Ulangi password baru"
                          className="pr-11"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword((current) => !current)
                          }
                          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          aria-label={
                            showConfirmPassword
                              ? "Sembunyikan konfirmasi password baru"
                              : "Lihat konfirmasi password baru"
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                      Syarat password
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {passwordChecks.map((check) => (
                        <p
                          key={check.label}
                          className={`text-sm ${check.passed
                            ? "text-green-600 dark:text-green-400"
                            : "text-slate-500 dark:text-slate-400"
                            }`}
                        >
                          {check.passed ? "✓" : "•"} {check.label}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t pt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={loading}>
              {loading ? "Menyimpan..." : formData.id ? "Update" : "Simpan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
