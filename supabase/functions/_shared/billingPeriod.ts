// Shared "what billing period is today in" derivation — used by generate-rent-charges and
// send-rent-reminders, which must always agree on this or a reminder can fire for a period whose
// charge doesn't exist yet (or vice versa). Do not reimplement this inline anywhere else.
export function currentPeriodDate(): Date {
  // Africa/Lusaka has no DST and matches the rest of the app's date handling (see
  // pay-portal-scheduled-payouts' todayWeekday) — using it here keeps "today" consistent with the
  // property's actual timezone rather than the function runtime's UTC clock.
  const [month, , year] = new Date().toLocaleDateString("en-US", { timeZone: "Africa/Lusaka" }).split("/");
  return new Date(Number(year), Number(month) - 1, 1);
}

/** Today's calendar date in Africa/Lusaka, formatted 'YYYY-MM-DD' — comparable against the
 * dueDate/gracePeriodEnd strings planRentCharge produces (same local-fields formatting, never
 * `.toISOString()`, which would shift the date for a positive UTC offset). */
export function todayYMD(): string {
  const [month, day, year] = new Date().toLocaleDateString("en-US", { timeZone: "Africa/Lusaka" }).split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Subtracts `days` calendar days from a 'YYYY-MM-DD' string, returning the same format. */
export function subtractDaysYMD(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
