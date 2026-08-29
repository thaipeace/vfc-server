/** 9 chữ số sau mã vùng (3–9 đầu dãy) */
const VN_MOBILE_CORE = /^([3-9]\d{8})$/;

export function extractPhoneCore(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const normalized = phone.replace(/[^\d+]/g, '').trim();
  const withoutPrefix = normalized.replace(/^(?:\+?84|0)/, '');
  const match = VN_MOBILE_CORE.exec(withoutPrefix);
  return match ? match[1] : null;
}

/** Các biến thể có thể lưu trong DB: 09x, 9x, 84x, +849x */
export function getPhoneVariants(phone: string): string[] {
  const core = extractPhoneCore(phone);
  if (!core) return [];
  return [...new Set([`0${core}`, core, `84${core}`, `+84${core}`])];
}

export function isValidVietnamesePhone(phone: string): boolean {
  return extractPhoneCore(phone) !== null;
}
