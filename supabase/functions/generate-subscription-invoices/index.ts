// Daily cron for IPM's OWN subscription billing — rolls each property's billing cycle forward,
// creates the next invoice, sends a reminder SMS a few days before it's due, and (only if the
// landlord opted into autopay) attempts to collect it automatically. Runs once a day; safe to
// re-run (every write here is either an upsert guarded by the (property_id, period) unique
// constraint, or gated by a boolean/status check), so a retried cron tick can't double-bill,
// double-text, or double-charge anyone.
//
// Price-per-tier is a hand-kept mirror of src/lib/plans.ts's PLAN_TIERS.monthlyPrice — this Deno
// function can't import frontend code, same reason pay-portal-collect-payment keeps its own copy
// of ONLINE_FEE_BANDS. Keep the two in sync if pricing ever changes.
//
// No Lenco webhook is wired for this collection type yet (collection.successful/failed in
// lenco-webhook only updates `collections`, the tenant-rent table) — pending/pay-offline
// subscription_payments are instead swept by polling Lenco directly each run via
// checkSubscriptionPayment, same fallback pattern pay-portal-check-collection already uses for
// tenant payments.
//
// Deploy:  supabase functions deploy generate-subscription-invoices
// Invoke:  POST with header x-cron-secret: <CRON_SECRET>  (wired to pg_cron via
//          select private.invoke_cron_function('generate-subscription-invoices'), daily)

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendSms } from "../_shared/sms.ts";
import { collectSubscriptionPayment, checkSubscriptionPayment } from "../_shared/subscriptionCollect.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// Same env var autopilot-collections already reads for its own deep links (e.g. /tenants/:token,
// /reports) — the landlord's own dashboard, not the tenant-facing portal.instayhomes.com portal.
const APP_URL = Deno.env.get("APP_URL") ?? "https://portal.instayhomes.com";

const TIER_PRICE: Record<string, number> = { starter: 799, growth: 1499, enterprise: 2499 };
const LEGACY_ALIASES: Record<string, string> = { pro: "growth" };

function tierIdFromLabel(label: string | null | undefined): string {
  const norm = (label ?? "").trim().toLowerCase();
  if (norm === "starter" || norm === "growth" || norm === "enterprise") return norm;
  if (norm in LEGACY_ALIASES) return LEGACY_ALIASES[norm];
  return "starter";
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function periodOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}
function addMonths(dateStr: string, months: number): string {
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, day));
  return ymd(d);
}
function daysUntil(dateStr: string, today: string): number {
  const a = new Date(`${dateStr}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86400000);
}

async function ensureInvoiceForPeriod(
  supabase: SupabaseClient,
  propertyId: string,
  amount: number,
  dueDate: string
): Promise<{ id: string; status: string; due_date: string; reminder_sent: boolean } | null> {
  const period = periodOf(new Date(`${dueDate}T00:00:00Z`));
  const { data: existing } = await supabase
    .from("subscription_invoices")
    .select("id, status, due_date, reminder_sent")
    .eq("property_id", propertyId)
    .eq("period", period)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("subscription_invoices")
    .insert({ property_id: propertyId, period, amount, due_date: dueDate, status: "pending" })
    .select("id, status, due_date, reminder_sent")
    .maybeSingle();
  if (error) {
    // 23505 = another concurrent run already created it (unique constraint) — fetch and use that one.
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("subscription_invoices")
        .select("id, status, due_date, reminder_sent")
        .eq("property_id", propertyId)
        .eq("period", period)
        .maybeSingle();
      return raced ?? null;
    }
    console.error("[generate-subscription-invoices] failed to create invoice", propertyId, error.message);
    return null;
  }
  return created;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = ymd(new Date());

  const { data: properties, error: propsError } = await supabase.from("properties").select("id");
  if (propsError || !properties) {
    return new Response(JSON.stringify({ error: propsError?.message ?? "Failed to load properties" }), { status: 500 });
  }

  let invoicesCreated = 0;
  let remindersSent = 0;
  let autopayAttempts = 0;
  let paymentsPolled = 0;

  for (const property of properties) {
    const { data: settings } = await supabase
      .from("settings")
      .select(
        "subscription_plan, subscription_renews_at, subscription_autopay, subscription_autopay_phone, subscription_autopay_operator, landlord_phone, notification_phone, subscription_pay_token"
      )
      .eq("property_id", property.id)
      .maybeSingle();
    if (!settings) continue;

    // Seed the very first cycle if this property has never had a renewal date set.
    let renewsAt: string = settings.subscription_renews_at ?? addMonths(today, 1);
    if (!settings.subscription_renews_at) {
      await supabase.from("settings").update({ subscription_renews_at: renewsAt }).eq("property_id", property.id);
    }

    const amount = TIER_PRICE[tierIdFromLabel(settings.subscription_plan)];

    let invoice = await ensureInvoiceForPeriod(supabase, property.id, amount, renewsAt);
    if (!invoice) continue;
    invoicesCreated++; // harmless over-count on re-runs where it already existed; not worth a second round trip to tell apart

    // Roll the cycle forward once the current invoice is actually paid.
    if (invoice.status === "paid" && invoice.due_date === renewsAt) {
      renewsAt = addMonths(renewsAt, 1);
      await supabase.from("settings").update({ subscription_renews_at: renewsAt }).eq("property_id", property.id);
      invoice = await ensureInvoiceForPeriod(supabase, property.id, amount, renewsAt);
      if (!invoice) continue;
    }

    // Mark the current invoice overdue once its due date has passed unpaid.
    if (invoice.status === "pending" && daysUntil(invoice.due_date, today) < 0) {
      await supabase.from("subscription_invoices").update({ status: "overdue" }).eq("id", invoice.id);
      invoice = { ...invoice, status: "overdue" };
    }

    // Poll any still-in-flight payment for this invoice before deciding whether to remind/autopay.
    const { data: inFlight } = await supabase
      .from("subscription_payments")
      .select("id, status")
      .eq("invoice_id", invoice.id)
      .in("status", ["pending", "pay-offline"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inFlight) {
      await checkSubscriptionPayment(supabase, inFlight.id);
      paymentsPolled++;
      const { data: refreshed } = await supabase.from("subscription_invoices").select("id, status, due_date, reminder_sent").eq("id", invoice.id).maybeSingle();
      if (refreshed) invoice = refreshed;
    }

    if (invoice.status === "paid") continue;

    // Reminder SMS: 3 days out, once per invoice.
    const daysLeft = daysUntil(invoice.due_date, today);
    if (!invoice.reminder_sent && daysLeft <= 3 && daysLeft >= -2) {
      const phone = settings.landlord_phone || settings.notification_phone;
      if (phone) {
        const dueLabel = new Date(`${invoice.due_date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        // The landlord's own direct-pay link, no dashboard sign-in needed, same reasoning the
        // tenant rent link uses. settings.subscription_pay_token is backfilled for every property
        // (see the subscription_pay_token migration), so this is never empty.
        const payLink = `${APP_URL}/subscription/${settings.subscription_pay_token}`;
        const message =
          daysLeft >= 0
            ? `IPM: Your K${amount} subscription is due ${dueLabel}. Pay here to keep your account active: ${payLink}`
            : `IPM: Your K${amount} subscription payment is overdue. Pay here to avoid any interruption: ${payLink}`;
        const result = await sendSms(phone, message);
        if (result.ok) {
          await supabase.from("subscription_invoices").update({ reminder_sent: true }).eq("id", invoice.id);
          remindersSent++;
        }
      }
    }

    // Autopay: only once the due date has arrived, only if opted in, only if nothing's already in flight.
    if (
      settings.subscription_autopay &&
      settings.subscription_autopay_phone &&
      settings.subscription_autopay_operator &&
      daysUntil(invoice.due_date, today) <= 0 &&
      !inFlight
    ) {
      await collectSubscriptionPayment(supabase, {
        invoiceId: invoice.id,
        propertyId: property.id,
        amount,
        phone: settings.subscription_autopay_phone,
        operator: settings.subscription_autopay_operator,
        triggeredBy: "autopay",
      });
      autopayAttempts++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, properties: properties.length, invoicesCreated, remindersSent, autopayAttempts, paymentsPolled }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
