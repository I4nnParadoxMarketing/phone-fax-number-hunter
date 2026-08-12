import { parsePhoneNumberFromString } from "libphonenumber-js";

const DIGITS_ONLY = /^\d+$/;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizePhone(value: string, defaultCountry: "US" = "US"): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed?.isValid()) {
    return parsed.format("E.164");
  }

  const digits = digitsOnly(trimmed);
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }

  return null;
}

export function phoneNumbersMatch(a: string, b: string): boolean {
  const normA = normalizePhone(a) ?? digitsOnly(a);
  const normB = normalizePhone(b) ?? digitsOnly(b);
  if (!normA || !normB) return false;

  if (normA === normB) return true;

  const digitsA = digitsOnly(normA);
  const digitsB = digitsOnly(normB);
  if (digitsA === digitsB) return true;

  // Match when one number is a suffix of the other (e.g. with/without country code)
  return digitsA.endsWith(digitsB) || digitsB.endsWith(digitsA);
}

export function normalizeForComparison(value: string): string {
  const normalized = normalizePhone(value);
  if (normalized) return digitsOnly(normalized);
  return digitsOnly(value);
}

export function isLikelyPhoneFragment(value: string): boolean {
  const digits = digitsOnly(value);
  return DIGITS_ONLY.test(digits) && digits.length >= 7;
}
