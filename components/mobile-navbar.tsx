"use client";

import { startTransition, useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { usePermission } from "@/lib/helper/check-role";
import { useTenantConfig } from "@/contexts/TenantConfigContext";
import {
  LayoutDashboard,
  Users,
  Calendar,
  TrendingUp,
  Wallet,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  Home,
  ClipboardCheck,
  ListTodo,
  Receipt,
  Shield,
  Banknote,
  Clock,
  ChevronDown,
  Split,
  CalendarSync
} from "lucide-react";

export default function MobileNavbar() {
  const { checkRoleMulti } = usePermission();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(
    pathname.startsWith("/finance")
      ? ["finance"]
      : pathname === "/work-shifts" || pathname === "/shift-schedules"
        ? ["shift-management"]
        : [],
  );
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const tenantConfig = useTenantConfig();
  const tenantLogo =
    theme === "dark"
      ? tenantConfig?.logoDarkUrl || tenantConfig?.logoUrl
      : tenantConfig?.logoUrl || tenantConfig?.logoDarkUrl;

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

  const menuItems = [
    {
      id: "dashboard",
      name: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
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
      name: "Ketidakhadiran",
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
        { name: "Dashboard", path: "/finance/dashboard" },
        { name: "Kategori Akun", path: "/finance/account-categories" },
        { name: "Akun", path: "/finance/accounts" },
        { name: "Customer", path: "/finance/customers" },
        { name: "Vendor", path: "/finance/vendors" },
        { name: "Jurnal Umum", path: "/finance/journals" },
        { name: "Buku Besar", path: "/finance/ledger" },
      ],
    },
    {
      id: "performances",
      name: "Penilaian Kinerja",
      icon: TrendingUp,
      path: "/performances",
      permissions: ["get-all", "get-by-id"],
    },
  ].filter((item) => {
    if (!("permissions" in item) || !item.permissions) return true;
    if ("permissionModels" in item && item.permissionModels) {
      return item.permissionModels.some((model) =>
        checkRoleMulti(model, item.permissions),
      );
    }
    return checkRoleMulti(item.id, item.permissions);
  });

  const bottomNavItems = [
    { id: "dashboard", icon: Home, path: "/dashboard", label: "Home" },
    {
      id: "submissions",
      icon: Calendar,
      path: "/submissions",
      label: "Cuti",
      permissions: ["get-all", "get-by-id"],
    },
    {
      id: "attendances",
      icon: ClipboardCheck,
      path: "/attendances",
      label: "Kehadiran",
      permissions: ["get-all", "get-by-id"],
    },
    {
      id: "task-managements",
      icon: ListTodo,
      path: "/task-managements",
      label: "Tugas",
      permissions: ["get-all", "get-by-id"],
    },
    {
      id: "reimbursements",
      icon: Receipt,
      path: "/reimbursements",
      label: "Reimburse",
      permissions: ["get-all", "get-by-id"],
    },
  ].filter((item) => {
    if (!("permissions" in item) || !item.permissions) return true;
    return checkRoleMulti(item.id, item.permissions);
  });

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

  const closeMenu = () => setIsMenuOpen(false);

  const toggleMenu = (id: string) => {
    setExpandedMenus((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleBottomNavClick = (path: string) => {
    if (pathname === path) return;

    startTransition(() => {
      router.push(path);
    });
  };

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.classList.add("mobile-menu-open");
    } else {
      document.body.classList.remove("mobile-menu-open");
    }

    return () => {
      document.body.classList.remove("mobile-menu-open");
    };
  }, [isMenuOpen]);

  return (
    <>
      {/* Mobile Top Navbar */}
      <nav className="fixed left-0 right-0 top-0 z-50 lg:hidden">
        <div className="px-4 pt-3">
          <div className="flex h-14 items-center justify-between rounded-[0.9rem] border border-slate-200/70 bg-white/80 px-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/75 dark:shadow-[0_18px_40px_rgba(2,6,23,0.35)]">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center" onClick={handleLogoClick}>
              {tenantLogo ? (
                <Image
                  src={tenantLogo}
                  alt={tenantConfig?.companyName ?? "Company Logo"}
                  width={110}
                  height={32}
                  priority
                  className="max-h-8 w-auto object-contain"
                  unoptimized
                />
              ) : (
                <>
                  <Image
                    src="/logo_jahris_colored.png"
                    alt="Jahris Logo"
                    width={80}
                    height={16}
                    priority
                    className="object-contain dark:hidden"
                  />
                  <Image
                    src="/logo_jahris_white.png"
                    alt="Jahris Logo"
                    width={80}
                    height={16}
                    priority
                    className="hidden object-contain dark:block"
                  />
                </>
              )}
            </Link>

            {/* Right Side Icons */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/80 text-slate-700 transition-colors hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
                aria-label="Toggle theme"
              >
                {theme === "light" ? (
                  <Moon className="w-5 h-5" />
                ) : (
                  <Sun className="w-5 h-5" />
                )}
              </button>

              {/* Menu Toggle */}
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.35)] transition-all hover:bg-blue-700 active:scale-95 dark:bg-blue-500 dark:hover:bg-blue-400"
                aria-label="Toggle menu"
              >
                {isMenuOpen ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Menu className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <>
        {/* Backdrop */}
        <div
          className={`lg:hidden fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-md transition-opacity duration-300 ${isMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
          onClick={closeMenu}
        />

        {/* Slide-in Menu */}
        <div
          className={`lg:hidden mobile-menu-scroll fixed bottom-24 left-4 right-4 top-[4.75rem] z-50 flex flex-col overflow-y-auto rounded-[0.9rem] border border-slate-200/70 bg-white/92 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl transition-all duration-300 ease-in-out dark:border-white/10 dark:bg-slate-900/88 dark:shadow-[0_30px_90px_rgba(2,6,23,0.45)] ${isMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
            }`}
        >
          {/* Menu Items */}
          <nav className="flex-1 space-y-1 p-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.path ||
                ("subItems" in item && item.subItems?.some((subItem) => pathname === subItem.path));
              const isExpanded = expandedMenus.includes(item.id);

              if ("subItems" in item && item.subItems) {
                return (
                  <div key={item.id} className="space-y-1">
                    <button
                      onClick={() => toggleMenu(item.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 ${isActive
                        ? "bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-500/15 dark:text-blue-300"
                        : "text-gray-700 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-white/8"
                        }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="flex-1 text-left">{item.name}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""
                          }`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="ml-6 border-l border-slate-200 pl-3 pt-1 dark:border-white/10">
                        {item.subItems.map((subItem) => {
                          const isSubActive = pathname === subItem.path;

                          return (
                            <Link
                              key={subItem.path}
                              href={subItem.path}
                              onClick={() => {
                                setExpandedMenus((prev) =>
                                  prev.filter((menuId) => menuId !== item.id),
                                );
                                closeMenu();
                              }}
                              className={`block rounded-xl px-3 py-2 text-sm transition-colors ${isSubActive
                                ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                                : "text-gray-600 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-white/8"
                                }`}
                            >
                              {subItem.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={item.path}
                  onClick={closeMenu}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 ${isActive
                    ? "bg-blue-50 font-semibold text-blue-700 shadow-sm dark:bg-blue-500/15 dark:text-blue-300"
                    : "text-gray-700 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-white/8"
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* ===== WATERMARK BOTTOM ===== */}
          <div className="px-6 pb-5 mt-auto">
            <div
              onClick={handleLogoClick}
              className="flex items-center justify-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity text-gray-500 dark:text-gray-400 select-none cursor-pointer"
            >
              <Image
                src="/logo_jaxer_colored.png"
                alt="Jaxer Watermark"
                width={65}
                height={14}
                className="object-contain dark:hidden mt-0.5"
                unoptimized
              />
              <Image
                src="/logo_jaxer_white.png"
                alt="Jaxer Watermark"
                width={65}
                height={14}
                className="object-contain hidden dark:block mt-0.5"
                unoptimized
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="space-y-2 border-t border-slate-200 p-4 dark:border-white/10">
            {/* Logout Button */}
            <button
              onClick={() => {
                closeMenu();
                handleLogout();
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-red-600 transition-all duration-200 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </>

      {/* Mobile Bottom Navigation Bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-in-out lg:hidden ${isMenuOpen ? "translate-y-full" : "translate-y-0"
          }`}
      >
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2">
          <div className="mx-auto flex max-w-md items-end justify-around rounded-[2rem] border border-slate-200/70 bg-white/88 px-2 py-2 shadow-[0_20px_40px_rgba(15,23,42,0.14)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/82 dark:shadow-[0_24px_60px_rgba(2,6,23,0.45)]">
            {bottomNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.path || pathname.startsWith(item.path);

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => handleBottomNavClick(item.path)}
                  className={`flex min-w-[60px] touch-manipulation flex-col items-center justify-center rounded-[1.4rem] px-3 py-2 transition-all duration-200 ${isActive
                    ? "-translate-y-1 bg-blue-600 text-white shadow-[0_12px_26px_rgba(37,99,235,0.35)] dark:bg-blue-500"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100"
                    }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    className={`h-5 w-5 ${isActive ? "scale-110" : ""} transition-transform`}
                  />
                  <span
                    className={`mt-1 text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Spacer for content (prevents content from being hidden under fixed navbar) */}
      <div className="h-[4.75rem] lg:hidden" />

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
