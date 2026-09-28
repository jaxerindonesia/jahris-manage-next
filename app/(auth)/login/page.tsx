"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Shield,
  X,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwordShake, setPasswordShake] = useState(false);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const triggerPasswordShake = () => {
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    setPasswordShake(true);
    shakeTimerRef.current = setTimeout(() => setPasswordShake(false), 600);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          remember_me: rememberMe,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Login failed");
        triggerPasswordShake();
        setIsLoading(false);
        return;
      }

      // save to local storage
      localStorage.setItem("hr_user_data", JSON.stringify(data.user));
      localStorage.setItem(
        "hr_user_role",
        JSON.stringify(data.user.permissions),
      );

      router.push("/dashboard");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      triggerPasswordShake();
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) setError("");
    if (passwordShake) setPasswordShake(false);
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl animate-pulse [animation-delay:0.5s]" />

        {/* Grid Pattern Overlay */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)",
            backgroundSize: "100px 100px",
            maskImage:
              "radial-gradient(ellipse 80% 50% at 50% 50%, black, transparent)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 50% at 50% 50%, black, transparent)",
          }}
        />
      </div>

      {/* Main Content */}
      <div className="flex flex-1">
        {/* LEFT SIDE - Login Form */}
        <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-8 lg:p-8">
          <div className="w-full max-w-md">
            {/* Glass Card */}
            <div
              className="space-y-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl sm:space-y-8 sm:rounded-3xl sm:p-8"
              style={{ animation: "fadeInUp 0.6s ease-out" }}
            >
              {/* Logo & Title */}
              <div className="space-y-3 text-center sm:space-y-4">
                <div className="mb-3 flex justify-center transition-transform duration-300 hover:scale-105 sm:mb-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-900/50 blur-2xl rounded-full" />
                    <Image
                      src="/icon_jahris_white.png"
                      alt="Jahris Logo"
                      width={80}
                      height={60}
                      priority
                      className="relative z-10 h-auto w-[80px] object-contain sm:w-[80px] lg:w-[80px] my-3"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-3xl font-bold leading-tight text-transparent sm:text-4xl">
                    Selamat Datang
                  </h2>
                  <p className="mx-auto flex max-w-[320px] items-center justify-center gap-2 text-sm leading-6 text-gray-400 sm:max-w-none sm:leading-normal">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-400 sm:mt-0" />
                    <span>Satu akses untuk semua aktivitas kerja</span>
                  </p>
                </div>
              </div>

              {/* Error Message with Animation */}
              {error && (
                <div
                  className="flex items-center gap-3 p-4 bg-red-500/10 backdrop-blur-sm border border-red-500/30 rounded-xl text-red-400"
                  style={{
                    animation:
                      "slideInFade 0.3s ease-out, shake 0.5s ease-in-out 0.15s, errorPulse 1.5s ease-out 0.5s 2",
                  }}
                >
                  <AlertCircle className="w-5 h-5 shrink-0 animate-pulse" />
                  <span className="text-sm font-medium">{error}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" suppressHydrationWarning>
                {/* Email Field */}
                <div className="space-y-2 group">
                  <label
                    htmlFor="email"
                    className="block text-sm font-semibold text-gray-300 ml-1"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      suppressHydrationWarning
                      className="block w-full rounded-xl border border-white/10 py-3.5 pl-12 pr-4 text-[16px]
                      bg-white/5 text-white
                      placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10
                      transition-all duration-300"
                      placeholder="nama@domain.com"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2 group">
                  <label
                    htmlFor="password"
                    className="block text-sm font-semibold text-gray-300 ml-1"
                  >
                    Password
                  </label>
                  <div
                    className={`relative transition-all duration-300 rounded-xl ${passwordShake ? "ring-2 ring-red-500/60" : ""}`}
                    style={
                      passwordShake
                        ? { animation: "shake 0.6s ease-in-out" }
                        : undefined
                    }
                  >
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      suppressHydrationWarning
                      className="block w-full rounded-xl border border-white/10 py-3.5 pl-12 pr-14 text-[16px]
                      bg-white/5 text-white
                      placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10
                      transition-all duration-300"
                      placeholder="••••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-400 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center group cursor-pointer my-6">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-white/20 rounded bg-white/5 cursor-pointer transition-all"
                  />
                  <label
                    htmlFor="remember-me"
                    className="ml-2.5 block text-sm text-gray-300 cursor-pointer group-hover:text-white transition-colors"
                  >
                    Ingat saya
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-3.5 text-base font-semibold text-white
                  bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-slate-900
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-300 ease-out
                  shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02]
                  sm:text-lg"
                  style={{
                    backgroundSize: "200%",
                    backgroundPosition: "0% center",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundPosition = "100% center")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundPosition = "0% center")
                  }
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Memproses...</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-[16px]">Masuk ke Dashboard</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Watermark Logo Jaxer */}
            <div
              className="mt-5 flex cursor-pointer select-none items-center justify-center gap-2 opacity-50 transition-opacity hover:opacity-100 sm:mt-6"
              onClick={handleLogoClick}

            >
              <Image
                src="/logo_jaxer_white.png"
                alt="Jaxer Watermark"
                width={60}
                height={14}
                className="object-contain"
                unoptimized
              />
            </div>

            {/* Trust Indicators */}
            <div className="mt-6 hidden items-center justify-center gap-8 text-xs text-gray-500 sm:flex">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>SSL Secure</span>
              </div>
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <span>Data Protected</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Enhanced Decorative */}
        <div className="hidden lg:flex flex-1 relative overflow-hidden items-center justify-center">
          {/* Gradient Orbs */}
          <div className="absolute top-20 right-20 w-72 h-72 bg-blue-500/30 rounded-full blur-3xl animate-[float_6s_ease-in-out_infinite]" />
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-500/30 rounded-full blur-3xl animate-[float-delayed_8s_ease-in-out_infinite]" />

          {/* Content */}
          <div className="relative z-10 text-white p-12 max-w-2xl">
            <div className="space-y-8">
              {/* Main Headline */}
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 backdrop-blur-sm border border-blue-500/30">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-semibold text-blue-300">
                    Platform HR Jaxer Grup Indonesia
                  </span>
                </div>

                <h1 className="text-6xl font-bold leading-tight bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent">
                  Kelola HR Anda dengan{" "}
                  <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    Lebih Mudah
                  </span>
                </h1>

                <p className="text-xl text-gray-300 leading-relaxed">
                  Sistem manajemen karyawan yang modern, efisien, dan
                  terintegrasi untuk membawa perusahaan Anda ke level berikutnya
                </p>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-2 gap-4 pt-4">
                {[
                  {
                    icon: "👥",
                    title: "Manajemen Karyawan",
                    desc: "Database lengkap & terorganisir",
                  },
                  {
                    icon: "💰",
                    title: "Payroll Otomatis",
                    desc: "Perhitungan akurat & cepat",
                  },
                  {
                    icon: "📅",
                    title: "Cuti & Absensi",
                    desc: "Tracking real-time",
                  },
                  {
                    icon: "📊",
                    title: "Laporan Lengkap",
                    desc: "Analytics mendalam",
                  },
                ].map((feature, index) => (
                  <div
                    key={index}
                    className="group relative p-5 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 
                    hover:bg-white/10 hover:border-white/20 hover:scale-105 transition-all duration-300
                    hover:shadow-xl hover:shadow-blue-500/10"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative space-y-2">
                      <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">
                        {feature.icon}
                      </div>
                      <h3 className="font-bold text-white">{feature.title}</h3>
                      <p className="text-sm text-gray-400">{feature.desc}</p>
                    </div>
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg
                        className="w-5 h-5 text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-8 pt-6">
                {[
                  { value: "10+", label: "Karyawa Aktif" },
                  { value: "99.9%", label: "Uptime" },
                  { value: "24/7", label: "Support" },
                ].map((stat, index) => (
                  <div key={index} className="space-y-1">
                    <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      {stat.value}
                    </div>
                    <div className="text-sm text-gray-400">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Transparant tanpa background */}
      <footer className="relative z-10 px-4 py-3 text-center text-[11px] text-gray-400 sm:py-4 sm:text-xs">
        &copy;{new Date().getFullYear()} Jahris {process.env.NEXT_PUBLIC_APP_VERSION} • Jaxer Grup Indonesia.
      </footer>

      {/* ===== CREDITS MODAL (EASTER EGG) ===== */}
      {showCredits && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setShowCredits(false)}
          />

          {/* Modal */}
          <div className="relative bg-slate-900 rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 slide-in-from-bottom-8 duration-500 border border-slate-700">
            {/* Close Button */}
            <button
              onClick={() => setShowCredits(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-white transition-all duration-300 hover:rotate-90 hover:scale-110 p-1"
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
              <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                Website By
              </h3>

              <div className="flex flex-col gap-3 font-semibold text-[15px] text-gray-200">
                <a href="https://github.com/ahmadasshidiq" target="_blank" rel="noopener noreferrer" className="block px-4 py-3 bg-slate-800/80 rounded-xl border border-slate-700 hover:scale-[1.03] transition-transform duration-300">
                  <span className="bg-gradient-to-r from-blue-500 to-cyan-500 w-2 h-2 rounded-full inline-block mr-3"></span>
                  M. Abu Bakar Ashidiq
                </a>
                <a href="https://www.linkedin.com/in/famadha-nugraha-setyajati-42aaa6287" target="_blank" rel="noopener noreferrer" className="block px-4 py-3 bg-slate-800/80 rounded-xl border border-slate-700 hover:scale-[1.03] transition-transform duration-300">
                  <span className="bg-gradient-to-r from-indigo-500 to-purple-500 w-2 h-2 rounded-full inline-block mr-3"></span>
                  Famadha Nugraha Setyajati
                </a>
                <a href="https://github.com/suryadharmabakti" target="_blank" rel="noopener noreferrer" className="block px-4 py-3 bg-slate-800/80 rounded-xl border border-slate-700 hover:scale-[1.03] transition-transform duration-300">
                  <span className="bg-gradient-to-r from-orange-500 to-rose-500 w-2 h-2 rounded-full inline-block mr-3"></span>
                  Surya Dharma Bakti RM
                </a>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <button
                onClick={() => setShowCredits(false)}
                className="px-8 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-gray-300 font-medium transition-all duration-300 active:scale-95 text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
