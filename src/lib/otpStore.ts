interface OTPData {
  code: string;
  expiresAt: number;
}

// In-memory store for OTP codes keyed by sanitized phone number
const otpMap = new Map<string, OTPData>();

export function generateOTP(phone: string): string {
  const sanitized = phone.replace(/\D/g, '');
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // berlaku 5 menit
  otpMap.set(sanitized, { code, expiresAt });
  return code;
}

export function verifyOTP(phone: string, inputCode: string): boolean {
  const sanitized = phone.replace(/\D/g, '');
  const data = otpMap.get(sanitized);

  if (!data) return false;
  if (Date.now() > data.expiresAt) {
    otpMap.delete(sanitized);
    return false;
  }

  if (data.code === inputCode.trim()) {
    otpMap.delete(sanitized);
    return true;
  }

  return false;
}
