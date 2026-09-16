// Automated SMS should only go out during a sensible window — a maintenance report at 2am
// shouldn't wake a landlord up. Fixed for now (not yet a per-property setting); anything generated
// outside this window is deferred to `pending_instant_sms` and swept the next time
// send-notification-digests runs inside the window.
const QUIET_HOURS_START = 8; // 08:00 Africa/Lusaka
const QUIET_HOURS_END = 19; // 19:00 Africa/Lusaka

export function isWithinSendWindow(): boolean {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "Africa/Lusaka", hour: "numeric", hour12: false }));
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
}
