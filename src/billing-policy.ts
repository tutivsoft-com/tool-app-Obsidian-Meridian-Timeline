export const FREE_USES_PER_DAY = 3;

export function localDateKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function freeUsesRemaining(today: string, recordedDate: string, used: number): number {
  const safeUsed = Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0;
  return recordedDate === today ? Math.max(0, FREE_USES_PER_DAY - safeUsed) : FREE_USES_PER_DAY;
}

export function normalizedBalance(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const balance = Number(value);
  return Number.isFinite(balance) && balance >= 0 ? Math.floor(balance) : null;
}

export function isValidBillingEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
