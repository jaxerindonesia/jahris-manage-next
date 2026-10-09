"use client";

import React, { useState, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { useTenantConfig } from "@/contexts/TenantConfigContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sidebar as SidebarShell,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Users,
  Calendar,
  TrendingUp,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  ChevronDown,
  Wallet,
  AlertTriangle,
  X,
  Shield,
  ClipboardCheck,
  Receipt,
  Banknote,
  ListTodo,
  Clock,
  Split,
  CalendarSync,
  CreditCard,
} from "lucide-react";
import { usePermission } from "@/lib/helper/check-role";
import { usePlanFeatures } from "@/lib/helper/client-session";
import { hasPlanFeature } from "@/lib/auth/feature-access";

type SidebarSubItem = {
  name: string;
  path: string;
  isSpecial?: boolean;
};

type SidebarItem = {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  permissions?: string[];
  superadminOnly?: boolean;
  subItems?: SidebarSubItem[];
  permissionModels?: string[];
};

export default function DesktopSidebar() {
  const { checkRoleMulti } = usePermission();
  const planFeatures = usePlanFeatures();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(
    pathname.startsWith("/finance")
      ? ["finance"]
      : pathname.startsWith("/subscriptions") || pathname === "/tenants" || pathname === "/plans" || pathname === "/payment-methods"
        ? ["subscription-management"]
      : pathname === "/work-shifts" || pathname === "/shift-schedules"
        ? ["shift-management"]
        : [],
  );
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const tenantConfig = useTenantConfig();

  // Easter egg states
  const [showCredits, setShowCredits] = useState(false);
  const [, setLogoClicks] = useState(0);
  const clickResetTimer = useRef<NodeJS.Timeout | null>(null);

  const handleLogoClick = () => {
    setLogoClicks((prev) => {
      const newCount = prev + 1;
      if (newCount >= 3) {
        setShowCredits(true);
        return 0;
      }
      return newCount;
    });

    if (clickResetTimer.current) clearTimeout(clickResetTimer.current);
    clickResetTimer.current = setTimeout(() => {
      setLogoClicks(0);
    }, 1500);
  };
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const toggleMenu = (id: string) => {
    setExpandedMenus((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const isSuperAdmin = useSyncExternalStore(
    () => () => { },
    () => {
      const raw = localStorage.getItem("hr_user_data");
      if (!raw) return false;

      try {
        const userData = JSON.parse(raw);
        const rawRoleName =
          typeof userData?.role === "string"
            ? userData.role
            : userData?.role?.name || userData?.roleName;
        const roleName = rawRoleName?.toLowerCase().replace(/\s/g, "") || "";
        return roleName === "superadmin";
      } catch {
        return false;
      }
    },
    () => false,
  );

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      // Clear local storage
      localStorage.removeItem("hr_user_data");
      localStorage.removeItem("hr_user_role");
    } catch (err) {
      console.error("LOGOUT ERROR:", err);
    }

    router.push("/login");
  };

  const menuItems = React.useMemo(() => {
    const allItems: SidebarItem[] = [
      {
        id: "dashboard",
        name: "Dashboard",
        icon: LayoutDashboard,
        path: "/dashboard",
      },
      {
        id: "subscription-management",
        name: "Manajemen Langganan",
        icon: CreditCard,
        path: "/subscriptions",
        permissions: ["get-all", "get-by-id"],
        superadminOnly: true,
        subItems: [
          { name: "Tenant", path: "/tenants" },
          { name: "Plan", path: "/plans" },
          { name: "Langganan", path: "/subscriptions" },
          { name: "Metode Pembayaran", path: "/payment-methods" },
        ],
      },
      {
        id: "branches",
        name: "Cabang",
        icon: Split,
        path: "/branches",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "users",
        name: "Data Karyawan",
        icon: Users,
        path: "/employees",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "shift-management",
        name: "Manajemen Shift",
        icon: CalendarSync,
        path: "/shift",
        permissions: ["get-all", "get-by-id"],
        permissionModels: ["work-shifts", "shift-schedules"],
        subItems: [
          { name: "Shift Kerja", path: "/shift/work-shifts" },
          { name: "Jadwal Shift", path: "/shift/shift-schedules" },
        ],
      },
      {
        id: "submissions",
        name: "Pengajuan Ketidakhadiran",
        icon: Calendar,
        path: "/submissions",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "attendances",
        name: "Kehadiran",
        icon: ClipboardCheck,
        path: "/attendances",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "task-managements",
        name: "Manajemen Tugas",
        icon: ListTodo,
        path: "/task-managements",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "payrolls",
        name: "Payroll",
        icon: Wallet,
        path: "/payrolls",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "reimbursements",
        name: "Reimbursement",
        icon: Receipt,
        path: "/reimbursements",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "overtimes",
        name: "Lembur",
        icon: Clock,
        path: "/overtimes",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "pettycash",
        name: "Petty Cash",
        icon: Banknote,
        path: "/pettycash",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "finance",
        name: "Keuangan",
        icon: Wallet,
        path: "/finance",
        permissions: ["get-all", "get-by-id"],
        subItems: [
          {
            name: "Dashboard",
            path: "/finance/dashboard",
          },
          {
            name: "Kategori Akun",
            path: "/finance/account-categories",
          },
          {
            name: "Akun",
            path: "/finance/accounts",
          },
          {
            name: "Customer",
            path: "/finance/customers",
          },
          {
            name: "Vendor",
            path: "/finance/vendors",
          },
          {
            name: "Jurnal Umum",
            path: "/finance/journals",
          },
          {
            name: "Buku Besar",
            path: "/finance/ledger",
          },
        ],
      },
      {
        id: "performances",
        name: "Penilaian Kinerja",
        icon: TrendingUp,
        path: "/performances",
        permissions: ["get-all", "get-by-id"],
      },
      {
        id: "roles",
        name: "Roles",
        icon: Shield,
        path: "/roles",
        permissions: ["get-all", "get-by-id"],
        superadminOnly: true,
      },
    ];

    return allItems.filter((item) => {
      if (item.superadminOnly) {
        return isSuperAdmin;
      }
      const featureModels = item.permissionModels ?? [item.id];
      if (
        !isSuperAdmin &&
        !featureModels.some((model) => hasPlanFeature(planFeatures, model))
      ) {
        return false;
      }
      if (!item.permissions) return true;
      if (item.permissionModels) {
        return item.permissionModels.some((model) =>
          checkRoleMulti(model, item.permissions ?? []),
        );
      }
      return checkRoleMulti(item.id, item.permissions);
    });
  }, [checkRoleMulti, isSuperAdmin, planFeatures]);

  return (
    <>
      <SidebarShell
        className={`flex flex-col p-4 transition-all duration-300 ease-in-out
        ${sidebarOpen ? "md:w-[22rem]" : "md:w-[6.5rem]"} w-full h-full lg:h-screen md:sticky md:top-0`}
      >
        <SidebarInset
          className={`flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(241,247,255,0.98)_52%,rgba(232,242,255,0.96)_100%)] text-slate-900 shadow-[0_24px_60px_rgba(148,163,184,0.18)] ring-1 ring-sky-100/80 backdrop-blur-2xl transition-all duration-300 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(22,30,48,0.98)_0%,rgba(21,31,51,0.98)_100%)] dark:text-white dark:shadow-[0_24px_60px_rgba(2,6,23,0.42)] dark:ring-white/5 ${sidebarOpen ? "px-4 py-5" : "px-3 py-5"
            }`}
        >
          {/* ===== HEADER ===== */}
          <SidebarHeader className={`flex h-[72px] items-center ${sidebarOpen ? "justify-between px-2" : "justify-center"}`}>
            {sidebarOpen ? (
              <>
                <div className="flex h-full flex-1 items-center justify-start overflow-hidden">
                  {(() => {
                    const hasLight = !!tenantConfig?.logoUrl;
                    const hasDark = !!tenantConfig?.logoDarkUrl;
                    const showCompanyLogo = hasLight || hasDark;

                    // Jika kita punya logo perusahaan
                    if (showCompanyLogo) {
                      // Coba tentukan logo mana yang dipakai, fallback bila salah satu tidak diupload
                      const activeLogo =
                        theme === "dark"
                          ? tenantConfig?.logoDarkUrl || tenantConfig?.logoUrl
                          : tenantConfig?.logoUrl || tenantConfig?.logoDarkUrl;

                      return (
                        <>
                          <Image
                            src={activeLogo as string}
                            alt={tenantConfig?.companyName ?? "Company Logo"}
                            width={140}
                            height={45}
                            priority
                            className="max-h-[45px] w-auto rounded object-contain"
                            unoptimized
                          />

                        </>
                      );
                    }

                    // Default Logo Jaxer
                    return (
                      <>
                        {/* Logo Jaxer Default - Light */}
                        <Image
                          src="/logo_jahris_colored.png"
                          alt="Jahris Logo"
                          width={120}
                          height={20}
                          priority
                          className="object-contain dark:hidden"
                        />

                        {/* Logo Jaxer Default - Dark */}
                        <Image
                          src="/logo_jahris_white.png"
                          alt="Jahris Logo"
                          width={120}
                          height={20}
                          priority
                          className="hidden object-contain dark:block"
                        />
                      </>
                    );
                  })()}
                </div>
                <Button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  variant="ghost"
                  size="icon"
                  className="rounded-2xl border border-slate-200/80 bg-white/80 p-2 text-slate-600 backdrop-blur-md hover:bg-sky-50 hover:text-slate-900 active:scale-95 shadow-[0_10px_30px_rgba(148,163,184,0.18)] dark:border-white/15 dark:bg-white/[0.10] dark:text-white dark:hover:bg-white/[0.16] dark:hover:text-white dark:shadow-[0_10px_30px_rgba(15,23,42,0.22)]"
                >
                  <ChevronLeft className="size-5 transition-transform duration-300" />
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                variant="ghost"
                size="icon"
                className="rounded-2xl border border-slate-200/80 bg-white/80 p-2 text-slate-600 backdrop-blur-md hover:bg-sky-50 hover:text-slate-900 active:scale-95 shadow-[0_10px_30px_rgba(148,163,184,0.18)] dark:border-white/15 dark:bg-white/[0.10] dark:text-white dark:hover:bg-white/[0.16] dark:hover:text-white dark:shadow-[0_10px_30px_rgba(15,23,42,0.22)]"
              >
                <ChevronRight className="size-5 transition-transform duration-300" />
              </Button>
            )}
          </SidebarHeader>

          {/* ===== MENU ===== */}
          <SidebarContent className={`space-y-1 ${sidebarOpen ? "px-2 pt-4" : "px-0 pt-5"}`}>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      pathname === item.path ||
                      Boolean(item.subItems?.some((subItem) => pathname === subItem.path));
                    const isExpanded = expandedMenus.includes(item.id);
                    const currentType = searchParams.get("type");
                    const currentAction = searchParams.get("action");

                    if (item.subItems) {
                      return (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            onClick={() => {
                              if (!sidebarOpen) setSidebarOpen(true);
                              toggleMenu(item.id);
                            }}
                            className={`flex w-full items-center rounded-2xl transition-all duration-300 relative group
                    ${isActive
                                ? "border border-slate-200/80 bg-sky-300/40 text-slate-900 shadow-[0_14px_34px_rgba(148,163,184,0.18)] dark:border-white/10 dark:bg-white/[0.14] dark:text-white dark:shadow-[0_14px_34px_rgba(15,23,42,0.28)]"
                                : "text-slate-600 hover:bg-sky-50/80 hover:text-slate-900 dark:text-slate-200/80 dark:hover:bg-white/[0.07] dark:hover:text-white"
                              }
                    ${sidebarOpen ? "gap-3 px-4 py-3.5" : "justify-center px-0 py-3.5"}
                    hover:scale-[1.02] active:scale-[0.98]`}
                          >
                            {/* Animated Icon */}
                            <Icon
                              className={`w-5 h-5 shrink-0 transition-all duration-300 ${isActive
                                ? "scale-110"
                                : "group-hover:scale-110 group-hover:rotate-3"
                                }`}
                            />

                            {sidebarOpen && (
                              <>
                                <span className="flex-1 truncate text-sm font-medium text-left">
                                  {item.name}
                                </span>

                                <ChevronDown
                                  className={`w-4 h-4 transition-all duration-300 ${isExpanded ? "rotate-180" : ""
                                    }`}
                                />
                              </>
                            )}
                          </SidebarMenuButton>

                          {/* Submenu with smooth animation */}
                          {sidebarOpen && (
                            <div
                              className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded
                                ? "max-h-[60vh] opacity-100 mt-0.5"
                                : "max-h-0 opacity-0"
                                }`}
                            >
                              <div className="ml-6 mr-3 border-l border-slate-200 py-2 pl-3 dark:border-white/15">
                                {item.subItems.map((sub, index) => {
                                  const isSubActive =
                                    pathname === sub.path ||
                                    ((pathname === item.path &&
                                      currentType === sub.name) ||
                                      (pathname === item.path &&
                                        currentAction === "new" &&
                                        sub.name.includes("Form Pengajuan")));

                                  const isFormPengajuan =
                                    "isSpecial" in sub ? sub.isSpecial : false;

                                  return (
                                    <Link
                                      key={sub.name}
                                      href={sub.path}
                                      prefetch={false}
                                      onClick={() =>
                                        setExpandedMenus((prev) =>
                                          prev.filter((menuId) => menuId !== item.id),
                                        )
                                      }
                                      style={{
                                        animationDelay: `${index * 50}ms`,
                                      }}
                                      className={`block rounded-lg px-3 py-2 text-sm transition-all duration-300
                                ${isExpanded ? "animate-in slide-in-from-left-2 fade-in" : ""}
                                ${isFormPengajuan
                                          ? "border-l-4 border-cyan-500 bg-cyan-50 font-bold text-cyan-700 hover:scale-[1.02] hover:bg-cyan-100 dark:border-cyan-300 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:bg-cyan-400/15"
                                          : isSubActive
                                            ? "bg-slate-900/8 font-medium text-slate-900 shadow-sm dark:bg-white/[0.11] dark:text-white"
                                            : "text-slate-500 hover:bg-sky-50 hover:text-slate-900 dark:text-slate-300/65 dark:hover:bg-white/[0.06] dark:hover:text-white"
                                        }`}
                                    >
                                      {sub.name}
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </SidebarMenuItem>
                      );
                    }

                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          key={item.id}
                          asChild
                          className={`flex w-full items-center rounded-2xl transition-all duration-300 relative group
                ${isActive
                              ? "border border-slate-200/80 bg-sky-300/40 text-slate-900 shadow-[0_14px_34px_rgba(148,163,184,0.18)] dark:border-white/10 dark:bg-white/[0.14] dark:text-white dark:shadow-[0_14px_34px_rgba(15,23,42,0.28)]"
                              : "text-slate-600 hover:bg-sky-100/80 hover:text-slate-900 dark:text-slate-200/80 dark:hover:bg-white/[0.07] dark:hover:text-white"
                            }
                ${sidebarOpen ? "gap-3 px-4 py-3.5" : "justify-center px-0 py-3.5"}
                hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          <Link href={item.path}>
                            {/* Animated Icon */}
                            <Icon
                              className={`w-5 h-5 shrink-0 transition-all duration-300 ${isActive
                                ? "scale-110"
                                : "group-hover:scale-110 group-hover:rotate-3"
                                }`}
                            />

                            {sidebarOpen && (
                              <span className="flex-1 truncate text-sm font-medium">
                                {item.name}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          {/* ===== WATERMARK BOTTOM ===== */}
          <div className={`py-4 transition-opacity duration-300 ${sidebarOpen ? "opacity-100" : "hidden opacity-0"}`}>
            <div
              onClick={handleLogoClick}
              className="flex cursor-pointer items-center justify-end gap-1.5 text-slate-500 opacity-70 transition-opacity hover:opacity-100 select-none dark:text-white/55"

            >
              {/* Saat Terang -> Logo Berwarna */}
              <Image
                src="/logo_jaxer_colored.png"
                alt="Jaxer Watermark"
                width={65}
                height={14}
                className="mt-0.5 object-contain dark:hidden"
                unoptimized
              />
              {/* Saat Gelap -> Logo Putih */}
              <Image
                src="/logo_jaxer_white.png"
                alt="Jaxer Watermark"
                width={65}
                height={14}
                className="mt-0.5 hidden object-contain dark:block"
                unoptimized
              />
            </div>
          </div>

          {/* ===== FOOTER ===== */}
          <SidebarFooter className="space-y-2 border-t border-slate-200 pt-3 dark:border-white/10">
            {/* Theme Toggle */}
            <Button
              onClick={toggleTheme}
              variant="ghost"
              className={`flex h-auto w-full items-center rounded-2xl px-4 py-3
              text-slate-600 hover:bg-sky-200 hover:text-slate-900 dark:text-slate-200/80 dark:hover:bg-white/[0.07] dark:hover:text-white
              hover:scale-[1.02] active:scale-[0.98]
              ${sidebarOpen ? "justify-start gap-3 text-left" : "justify-center"}`}
            >
              {theme === "light" ? (
                <Moon className="w-5 h-5 group-hover:animate-[spin_1s_linear_infinite]" />
              ) : (
                <Sun className="w-5 h-5 group-hover:animate-[spin_1s_linear_infinite]" />
              )}

              {sidebarOpen && (
                <span className="font-medium">
                  {theme === "light" ? "Mode Gelap" : "Mode Terang"}
                </span>
              )}
            </Button>

            {/* Logout Button */}
            <Button
              onClick={() => setShowLogoutModal(true)}
              variant="ghost"
              className={`flex h-auto w-full items-center rounded-2xl px-4 py-3
              border border-transparent text-rose-500
              hover:border-rose-300/15 hover:bg-rose-400 hover:text-rose-50
              hover:scale-[1.02] active:scale-[0.98]
              ${sidebarOpen ? "justify-start gap-3 text-left" : "justify-center"}`}
            >
              <LogOut className="w-5 h-5 transition-all duration-300 group-hover:translate-x-1" />

              {sidebarOpen && <span className="font-medium">Logout</span>}
            </Button>
          </SidebarFooter>
        </SidebarInset>
      </SidebarShell>

      {/* ===== LOGOUT CONFIRMATION MODAL ===== */}
      <Dialog open={showLogoutModal} onOpenChange={setShowLogoutModal}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-8 w-8 animate-pulse text-red-600 dark:text-red-400" />
            </div>
          </div>
          <DialogHeader className="text-center">
            <DialogTitle className="text-center text-xl">Konfirmasi Logout</DialogTitle>
            <DialogDescription className="text-center">
              Apakah Anda yakin ingin keluar dari sistem? Anda perlu login kembali untuk mengakses dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 flex-col sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowLogoutModal(false)}
              className="flex-1"
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleLogout}
              className="flex-1"
            >
              Ya, Logout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CREDITS MODAL (EASTER EGG) ===== */}
      {showCredits && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setShowCredits(false)}
          />

          {/* Modal */}
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 slide-in-from-bottom-8 duration-500 border border-gray-100 dark:border-gray-700">
            {/* Close Button */}
            <button
              onClick={() => setShowCredits(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-300 hover:rotate-90 hover:scale-110 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-in zoom-in duration-700 rotate-3">
                <Shield className="w-10 h-10 text-white" />
              </div>
            </div>

            {/* Content */}
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                Website By
              </h3>

              <div className="flex flex-col gap-3 font-semibold text-[15px] text-gray-700 dark:text-gray-200">
                <a href="https://github.com/ahmadasshidiq" target="_blank" rel="noopener noreferrer" className="block px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600 hover:scale-[1.03] transition-transform duration-300">
                  <span className="bg-gradient-to-r from-blue-500 to-cyan-500 w-2 h-2 rounded-full inline-block mr-3"></span>
                  M. Abu Bakar Ashidiq
                </a>
                <a href="https://www.linkedin.com/in/famadha-nugraha-setyajati-42aaa6287" target="_blank" rel="noopener noreferrer" className="block px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600 hover:scale-[1.03] transition-transform duration-300">
                  <span className="bg-gradient-to-r from-indigo-500 to-purple-500 w-2 h-2 rounded-full inline-block mr-3"></span>
                  Famadha Nugraha Setyajati
                </a>
                <a href="https://github.com/suryadharmabakti" target="_blank" rel="noopener noreferrer" className="block px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600 hover:scale-[1.03] transition-transform duration-300">
                  <span className="bg-gradient-to-r from-orange-500 to-rose-500 w-2 h-2 rounded-full inline-block mr-3"></span>
                  Surya Dharma Bakti RM
                </a>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <button
                onClick={() => setShowCredits(false)}
                className="px-8 py-2.5 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-all duration-300 active:scale-95 text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
