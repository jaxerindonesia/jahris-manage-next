"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import Link from "next/link";
import { cn, DARK_GLASS_PANEL_CLASS } from "@/lib/utils";
import {
  Sun,
  Moon,
  ChevronDown,
  KeyRound,
  LogOut,
  Eye,
  EyeOff,
  X,
  ShieldCheck,
} from "lucide-react";
import { parseApiError } from "@/lib/helper/response-api";

function getPasswordValidationMessage(password: string) {
  if (password.length < 8) {
    return "Password baru minimal 8 karakter.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password baru harus mengandung minimal 1 huruf besar.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password baru harus mengandung minimal 1 huruf kecil.";
  }
  if (!/\d/.test(password)) {
    return "Password baru harus mengandung minimal 1 angka.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password baru harus mengandung minimal 1 karakter khusus.";
  }
  return null;
}

function getPasswordChecks(password: string) {
  return [
    { label: "Minimal 8 karakter", passed: password.length >= 8 },
    { label: "Minimal 1 huruf besar", passed: /[A-Z]/.test(password) },
    { label: "Minimal 1 huruf kecil", passed: /[a-z]/.test(password) },
    { label: "Minimal 1 angka", passed: /\d/.test(password) },
    { label: "Minimal 1 karakter khusus", passed: /[^A-Za-z0-9]/.test(password) },
  ];
}

const PasswordField = ({
  label,
  field,
  showKey,
  passwordForm,
  showPass,
  errors,
  setPasswordForm,
  setShowPass,
}: {
  label: string;
  field: "currentPassword" | "newPassword" | "confirmPassword";
  showKey: "current" | "new" | "confirm";
  passwordForm: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  };
  showPass: { current: boolean; new: boolean; confirm: boolean };
  errors: { [key: string]: string };
  setPasswordForm: React.Dispatch<
    React.SetStateAction<{
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }>
  >;
  setShowPass: React.Dispatch<
    React.SetStateAction<{ current: boolean; new: boolean; confirm: boolean }>
  >;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}
    </label>
    <div className="relative">
      <input
        type={showPass[showKey] ? "text" : "password"}
        value={passwordForm[field]}
        onChange={(e) =>
          setPasswordForm((prev) => ({ ...prev, [field]: e.target.value }))
        }
        className={`w-full px-4 py-2.5 pr-10 rounded-lg border text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none transition-all
          ${errors[field]
            ? "border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900"
            : "border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 focus:border-blue-400"
          }`}
        placeholder={`Masukkan ${label.toLowerCase()}`}
      />
      <button
        type="button"
        onClick={() =>
          setShowPass((prev) => ({ ...prev, [showKey]: !prev[showKey] }))
        }
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
      >
        {showPass[showKey] ? (
          <EyeOff className="w-4 h-4" />
        ) : (
          <Eye className="w-4 h-4" />
        )}
      </button>
    </div>
    {errors[field] && <p className="text-xs text-red-500">{errors[field]}</p>}
  </div>
);

export default function DesktopNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = React.useState({
    name: "Admin User",
    role: "Administrator",
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPass, setShowPass] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const passwordChecks = getPasswordChecks(passwordForm.newPassword);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials =
      parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2);
    return initials?.toUpperCase() || "?";
  };

  const getPageTitle = () => {
    const segments = pathname.split("/").filter(Boolean);
    const path = segments[0] || "dashboard";
    const subPath = segments[1] || "";
    const titles: { [key: string]: string } = {
      dashboard: "Dashboard",
      employees: "Data Karyawan",
      branches: "Cabang",
      submissions: "Pengajuan Ketidakhadiran",
      pettycash: "Petty Cash",
      finance: "Keuangan",
      attendances: "Kehadiran",
      "task-managements": "Manajemen Tugas",
      shift: "Shift",
      payrolls: "Payroll",
      performances: "Penilaian Kinerja",
      roles: "Roles",
      reimbursements: "Reimbursement",
      overtimes: "Lembur",
      tenants: "Tenant",
      subscriptions: "Manajemen Langganan",
      plans: "Plan",
      "payment-methods": "Metode Pembayaran",
    };

    if (path === "finance") {
      const financeTitles: { [key: string]: string } = {
        dashboard: "Dashboard",
        "account-categories": "Kategori Akun",
        accounts: "Akun",
        journals: "Jurnal Umum",
        customers: "Customer",
        vendors: "Vendor",
        ledger: "Buku Besar",
      };

      return subPath ? `Keuangan - ${financeTitles[subPath] || "Keuangan"}` : "Keuangan";
    }

    if (path === "shift") {
      const shiftTitles: { [key: string]: string } = {
        "work-shifts": "Shift Kerja",
        "shift-schedules": "Jadwal Shift",
      };

      return subPath ? `Manajemen Shift - ${shiftTitles[subPath] || "Shift"}` : "Shift";
    }

    if (path === "subscriptions") return "Langganan";

    return titles[path] || "Dashboard";
  };

  const getCurrentDateTime = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Jakarta",
    };
    return now.toLocaleDateString("id-ID", options);
  };

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("hr_user_data") || "{}");
    if (userData?.name) setUser(userData);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openPasswordModal = () => {
    setDropdownOpen(false);
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setErrors({});
    setSuccessMsg("");
    setModalOpen(true);
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!passwordForm.currentPassword)
      newErrors.currentPassword = "Password saat ini wajib diisi.";
    if (!passwordForm.newPassword) {
      newErrors.newPassword = "Password baru wajib diisi.";
    } else {
      const passwordValidationMessage = getPasswordValidationMessage(
        passwordForm.newPassword,
      );
      if (passwordValidationMessage) {
        newErrors.newPassword = passwordValidationMessage;
      }
    }
    if (!passwordForm.confirmPassword) {
      newErrors.confirmPassword = "Konfirmasi password wajib diisi.";
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      newErrors.confirmPassword = "Konfirmasi password tidak cocok.";
    }
    return newErrors;
  };

  const handleSubmit = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const userData = JSON.parse(localStorage.getItem("hr_user_data") || "{}");

      const res = await fetch("/api/auth/change_password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userData.id,
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (!res.ok) {
        setErrors({
          general: await parseApiError(res, "Terjadi kesalahan."),
        });
        return;
      }

      localStorage.removeItem("hr_user_data");
      localStorage.removeItem("hr_user_role");
      setSuccessMsg("Password berhasil diubah. Silakan login kembali.");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch {
      setErrors({ general: "Terjadi kesalahan. Silakan coba lagi." });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      localStorage.removeItem("hr_user_data");
      localStorage.removeItem("hr_user_role");
    } catch (err) {
      console.error("LOGOUT ERROR:", err);
    }
    router.push("/login");
  };

  return (
    <>
      <nav className="z-40 hidden lg:block">
        <div className="flex min-h-[104px] items-end justify-between pb-4 pl-4 pr-8 pt-5">
          {/* Left Section */}
          <div className="flex flex-col justify-end">
            <h1 className="text-md font-bold leading-none text-gray-900 dark:text-white lg:text-[1.4rem]">
              {getPageTitle()}
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {getCurrentDateTime()}
            </p>
          </div>

          {/* Right Section */}
          <div className={cn("flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/70 px-3 py-2 shadow-sm backdrop-blur-sm", DARK_GLASS_PANEL_CLASS)}>
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2.5 text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
              title={theme === "light" ? "Mode Gelap" : "Mode Terang"}
            >
              {theme === "light" ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>

            <div className="h-8 w-px bg-gray-300 dark:bg-white/10" />

            {/* User Profile with Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.08]"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-xs text-white font-bold ring-2 ring-blue-100 dark:ring-blue-900">
                  {getInitials(user.name)}
                </div>
                <div className="text-left hidden xl:block">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {user.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {user.role}
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-gray-500 dark:text-gray-400 hidden xl:block transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 z-50 mt-2 w-52 animate-in rounded-xl border border-gray-200 bg-white py-1 shadow-lg fade-in slide-in-from-top-2 duration-150 dark:border-white/10 dark:bg-slate-900/90 dark:backdrop-blur-xl">
                  <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {user.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {user.role}
                    </p>
                  </div>

                  <div className="py-1">
                    {/* Menu Kelola Tenant khusus Super Admin */}
                    {user?.role?.toLowerCase().replace(/\s/g, "") === "superadmin" && (
                      <Link
                        href="/tenants"
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        Kelola Tenant
                      </Link>
                    )}

                    <button
                      onClick={openPasswordModal}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <KeyRound className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      Ubah Password
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Change Password Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !loading && setModalOpen(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Ubah Password
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Perbarui kata sandi akun Anda
                  </p>
                </div>
              </div>
              <button
                onClick={() => !loading && setModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 flex flex-col gap-4">
              {successMsg ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <ShieldCheck className="w-7 h-7 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400 text-center">
                    {successMsg}
                  </p>
                  <button
                    onClick={() => {
                      setModalOpen(false);
                      router.push("/login");
                    }}
                    className="mt-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                  >
                    Login Ulang
                  </button>
                </div>
              ) : (
                <>
                  {errors.general && (
                    <div className="px-4 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {errors.general}
                      </p>
                    </div>
                  )}

                  <PasswordField
                    label="Password Saat Ini"
                    field="currentPassword"
                    showKey="current"
                    passwordForm={passwordForm}
                    showPass={showPass}
                    errors={errors}
                    setPasswordForm={setPasswordForm}
                    setShowPass={setShowPass}
                  />
                  <PasswordField
                    label="Password Baru"
                    field="newPassword"
                    showKey="new"
                    passwordForm={passwordForm}
                    showPass={showPass}
                    errors={errors}
                    setPasswordForm={setPasswordForm}
                    setShowPass={setShowPass}
                  />
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                      Syarat password baru
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {passwordChecks.map((check) => (
                        <p
                          key={check.label}
                          className={`text-sm ${
                            check.passed
                              ? "text-green-600 dark:text-green-400"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {check.passed ? "✓" : "•"} {check.label}
                        </p>
                      ))}
                    </div>
                  </div>
                  <PasswordField
                    label="Konfirmasi Password Baru"
                    field="confirmPassword"
                    showKey="confirm"
                    passwordForm={passwordForm}
                    showPass={showPass}
                    errors={errors}
                    setPasswordForm={setPasswordForm}
                    setShowPass={setShowPass}
                  />

                  {/* Footer Buttons */}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setModalOpen(false)}
                      disabled={loading}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={loading}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <svg
                            className="animate-spin w-4 h-4"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8z"
                            />
                          </svg>
                          Menyimpan...
                        </>
                      ) : (
                        "Simpan"
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
