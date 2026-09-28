"use client";

import React, { useState } from "react";
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
  User,
  Phone,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const isProduction = process.env.NODE_ENV === "production";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    password: "",
    confirmPassword: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    if (isProduction) {
      setError("Registrasi publik dinonaktifkan di production");
      setIsLoading(false);
      return;
    }

    // Validation
    if (
      !formData.fullName ||
      !formData.email ||
      !formData.password ||
      !formData.confirmPassword
    ) {
      setError("Semua field wajib diisi");
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Password dan konfirmasi password tidak cocok");
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("Password minimal 8 karakter");
      setIsLoading(false);
      return;
    }

    if (!agreeToTerms) {
      setError("Anda harus menyetujui syarat dan ketentuan");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.fullName,
          phone: formData.phone,
          position: formData.company,
          roleId: process.env.NEXT_PUBLIC_DEFAULT_ROLE_ID,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Register failed");
        setIsLoading(false);
        return;
      }

      router.push("/login");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-1/4 -right-48 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "0.5s" }}
        />

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
      <div className="flex-1 flex">
        {/* LEFT SIDE - Register Form */}
        <div className="flex-1 flex items-center justify-center p-8 relative z-10">
          <div className="w-full max-w-md">
            {/* Glass Card */}
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-8 space-y-6">
              {/* Logo & Title */}
              <div className="text-center space-y-4">
                <div className="flex justify-center mb-4 transform hover:scale-105 transition-transform duration-300">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full" />
                    <Image
                      src="/logo22.png"
                      alt="HR System Logo"
                      width={380}
                      height={60}
                      priority
                      className="object-contain relative z-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-4xl font-bold bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
                    Buat Akun Baru
                  </h2>
                  <p className="text-gray-400 text-sm flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    Bergabunglah dengan platform HR terbaik
                  </p>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 backdrop-blur-sm border border-red-500/30 rounded-xl text-red-400">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-medium">{error}</span>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="flex items-center gap-3 p-4 bg-green-500/10 backdrop-blur-sm border border-green-500/30 rounded-xl text-green-400">
                  <svg
                    className="w-5 h-5 shrink-0"
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
                  <span className="text-sm font-medium">{success}</span>
                </div>
              )}

              {/* Register Form */}
              {isProduction ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-amber-500/10 backdrop-blur-sm border border-amber-500/30 rounded-xl text-amber-300">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium">
                      Registrasi publik dinonaktifkan di production. Hubungi administrator untuk pembuatan akun.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="w-full h-12 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors"
                  >
                    Kembali ke Login
                  </button>
                </div>
              ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full Name Field */}
                <div className="space-y-2 group">
                  <label
                    htmlFor="fullName"
                    className="block text-sm font-semibold text-gray-300 ml-1"
                  >
                    Nama Lengkap
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      required
                      value={formData.fullName}
                      onChange={handleChange}
                      className="block w-full pl-12 pr-4 py-3 border border-white/10 rounded-xl
                      bg-white/5 text-white
                      placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10
                      transition-all duration-300"
                      placeholder="Nama"
                    />
                  </div>
                </div>

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
                      className="block w-full pl-12 pr-4 py-3 border border-white/10 rounded-xl
                      bg-white/5 text-white
                      placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10
                      transition-all duration-300"
                      placeholder="nama@jaxergrup.com"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-2 group">
                  <label
                    htmlFor="phone"
                    className="block text-sm font-semibold text-gray-300 ml-1"
                  >
                    No. Telepon
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      className="block w-full pl-12 pr-4 py-3 border border-white/10 rounded-xl
                      bg-white/5 text-white
                      placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10
                      transition-all duration-300"
                      placeholder="08123456789"
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
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="block w-full pl-12 pr-14 py-3 border border-white/10 rounded-xl
                      bg-white/5 text-white
                      placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10
                      transition-all duration-300"
                      placeholder="Min. 8 karakter"
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

                {/* Confirm Password Field */}
                <div className="space-y-2 group">
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-semibold text-gray-300 ml-1"
                  >
                    Konfirmasi Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="block w-full pl-12 pr-14 py-3 border border-white/10 rounded-xl
                      bg-white/5 text-white
                      placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10
                      transition-all duration-300"
                      placeholder="Ulangi password"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-400 transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Terms & Conditions */}
                <div className="flex items-start gap-3 pt-2">
                  <input
                    id="terms"
                    name="terms"
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-white/20 rounded bg-white/5 cursor-pointer transition-all"
                  />
                  <label
                    htmlFor="terms"
                    className="text-sm text-gray-300 cursor-pointer leading-relaxed"
                  >
                    Saya setuju dengan{" "}
                    <button
                      type="button"
                      className="font-semibold text-blue-400 hover:text-blue-300 transition-colors underline"
                    >
                      syarat dan ketentuan
                    </button>{" "}
                    serta{" "}
                    <button
                      type="button"
                      className="font-semibold text-blue-400 hover:text-blue-300 transition-colors underline"
                    >
                      kebijakan privasi
                    </button>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading || !agreeToTerms}
                  className="w-full group relative flex justify-center items-center gap-2 py-3.5 px-4 
                  rounded-xl text-white font-semibold
                  bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-slate-900
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-300 ease-out
                  shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02]
                  overflow-hidden"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Memproses...</span>
                    </div>
                  ) : (
                    <>
                      <span>Daftar Sekarang</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
              )}

              {/* Footer Text */}
              <p className="text-center text-sm text-gray-400 pt-2">
                Sudah punya akun?{" "}
                <button
                  onClick={() => router.push("/login")}
                  className="font-semibold text-blue-400 hover:text-blue-300 transition-colors underline"
                >
                  Masuk di sini
                </button>
              </p>
            </div>

            {/* Trust Indicators */}
            <div className="mt-8 flex items-center justify-center gap-8 text-gray-500 text-xs">
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
          <div
            className="absolute top-20 right-20 w-72 h-72 bg-blue-500/30 rounded-full blur-3xl"
            style={{ animation: "pulse 6s ease-in-out infinite" }}
          />
          <div
            className="absolute bottom-20 left-20 w-96 h-96 bg-purple-500/30 rounded-full blur-3xl"
            style={{
              animation: "pulse 8s ease-in-out infinite",
              animationDelay: "1s",
            }}
          />

          {/* Content */}
          <div className="relative z-10 text-white p-12 max-w-2xl">
            <div className="space-y-8">
              {/* Main Headline */}
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 backdrop-blur-sm border border-blue-500/30">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-semibold text-blue-300">
                    Jaxer Grup Indonesia
                  </span>
                </div>

                <h1 className="text-6xl font-bold leading-tight bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent">
                  Mulai Transformasi{" "}
                  <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    HR Digital
                  </span>
                </h1>

                <p className="text-xl text-gray-300 leading-relaxed">
                  Bergabunglah dengan ribuan perusahaan yang telah mempercayai
                  platform kami untuk mengelola sumber daya manusia
                </p>
              </div>

              {/* Benefits List */}
              <div className="space-y-4 pt-4">
                {[
                  {
                    icon: "👥",
                    title: "Manajemen Karyawan Terpadu",
                    desc: "Database karyawan lengkap dengan riwayat dan dokumen tersentralisasi",
                  },
                  {
                    icon: "💰",
                    title: "Payroll & Penggajian Otomatis",
                    desc: "Perhitungan gaji, THR, bonus, dan potongan akurat sesuai regulasi",
                  },
                  {
                    icon: "📊",
                    title: "Laporan Keuangan HR Real-time",
                    desc: "Analisis biaya karyawan, budget forecast, dan financial planning",
                  },
                  {
                    icon: "🎯",
                    title: "Absensi & Performance Tracking",
                    desc: "Monitor produktivitas dan KPI untuk evaluasi kompensasi",
                  },
                ].map((benefit, index) => (
                  <div
                    key={index}
                    className="group flex items-start gap-4 p-4 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 
                    hover:bg-white/10 hover:border-white/20 hover:translate-x-2 transition-all duration-300"
                  >
                    <div className="text-2xl mt-1 group-hover:scale-110 transition-transform">
                      {benefit.icon}
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-white">{benefit.title}</h3>
                      <p className="text-sm text-gray-400">{benefit.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-gray-400">
        &copy;{new Date().getFullYear()} Jahris {process.env.NEXT_PUBLIC_APP_VERSION} • Jaxer Grup Indonesia.
      </footer>
    </div>
  );
}
