const feeTypes = new Set(["fixed", "percentage", "hybrid"]);
const feeBearers = new Set(["customer", "merchant"]);
const amount = (value: unknown, fallback = "0") => value === null || value === "" || value === undefined ? fallback : String(value);

export function paymentData(body: Record<string, unknown>) {
  return {
    name: String(body.name || "").trim(), code: String(body.code || "").trim().toLowerCase(), description: String(body.description || "").trim() || null,
    provider: String(body.provider || "").trim().toLowerCase(), providerCode: String(body.providerCode || "").trim() || null, category: String(body.category || "").trim().toLowerCase(),
    feeType: String(body.feeType || "fixed").toLowerCase(), feeFixed: amount(body.feeFixed), feePercentage: amount(body.feePercentage), feeBearer: String(body.feeBearer || "customer").toLowerCase(),
    minAmount: amount(body.minAmount), maxAmount: body.maxAmount === null || body.maxAmount === "" || body.maxAmount === undefined ? null : String(body.maxAmount),
    iconUrl: String(body.iconUrl || "").trim() || null, isActive: body.isActive !== false, sortOrder: Number(body.sortOrder || 0),
  };
}

export function validatePaymentData(data: ReturnType<typeof paymentData>) {
  if (!data.name || !data.code || !data.provider || !data.category) return "Nama, code, provider, dan category wajib diisi";
  if (!/^[a-z0-9_]+$/.test(data.code)) return "Code hanya boleh berisi huruf kecil, angka, dan underscore";
  if (!feeTypes.has(data.feeType) || !feeBearers.has(data.feeBearer)) return "Konfigurasi biaya tidak valid";
  const values = [data.feeFixed, data.feePercentage, data.minAmount, data.maxAmount].filter((value): value is string => value !== null);
  if (values.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) return "Nilai biaya dan batas pembayaran harus berupa angka positif";
  if (data.maxAmount !== null && Number(data.maxAmount) < Number(data.minAmount)) return "Maksimum pembayaran tidak boleh lebih kecil dari minimum pembayaran";
  if (!Number.isInteger(data.sortOrder) || data.sortOrder < 0) return "Urutan tampilan tidak valid";
  return null;
}
