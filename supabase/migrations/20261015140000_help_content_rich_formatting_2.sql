-- Second pass of the rich-formatting rewrite started in 20261015130000: Rooms (2 articles) and
-- Rent & Payments (7 articles) -- 24 blocks. Same approach: restructure existing wording into
-- tables/bold/callouts, no facts added or changed. See HelpBody.tsx for how these render.

update public.help_blocks set body = $body$Before you can assign tenants to specific rooms, set up at least one **room type**. From Rooms, or straight from the Add tenant form if none exist yet, click **Add room type**.

| Field | What it sets |
| --- | --- |
| Name | e.g. Studio, Ensuite |
| Beds per room | How many beds each room of this type has |
| Monthly rent | Applies to every room under this type |
| Deposit terms | Refundable, Partially refundable, or Non-refundable |

:::note
Rent and deposit terms apply to **every room** you add under that type, so you only set them once.
:::

Finally choose how many rooms of this type to add right away. IPM numbers them automatically starting after whatever rooms you already have, and they're all created at once, ready to assign.$body$
where id = '4a929df5-462a-41aa-aa79-68d9f2ca43a3';

update public.help_blocks set body = $body$A room's status -- **vacant, occupied, reserved, or not ready** -- is never something you set directly. It's worked out automatically from which active tenants are actually assigned to it. A room becomes occupied the moment a tenant moves in there, and vacant again the moment that tenant moves out or is reassigned, with no separate step needed on the Rooms page itself.

:::tip
For a shared room with several beds, IPM tracks each bed individually: a four-bed room with one tenant in it still shows as having three open beds, and it will still appear in the room picker when adding a new tenant.
:::

Use **Mark not ready** to pull a vacant room out of service temporarily, for cleaning or repairs, and **Mark ready** to put it back once it's fit to assign again.$body$
where id = '17d8ce10-3566-48fd-84df-22892e3d70af';

update public.help_blocks set body = $body$**Reserve a room** is for holding a specific vacant room for a tenant who is not currently active -- for example a student away for the semester break who you expect to come back. It's different from assigning a room to a new or current tenant: you reach it from a moved-out tenant's profile, not from Rooms itself.

Pick a vacant room from the list (only rooms with a free bed are offered), and optionally record a holding fee: an amount, a payment method (mobile money, cash or bank), and the date it was collected.

:::note
This fee is a **separate, non-refundable** charge. It is not counted toward the tenant's first month's rent once they come back, and reserving the room does not charge any rent in the meantime.
:::

Once reserved, that room shows as **Reserved** on the Rooms page rather than Vacant, so it won't be offered to anyone else while it's being held.$body$
where id = '95311c1c-d291-4e25-882e-bd1fcc1989f0';

update public.help_blocks set body = $body$There is no separate unreserve button.

- To let the room go back into the normal vacant pool, open it from Rooms and use **Mark ready**. That clears the hold and makes it available again in the room picker for any tenant.
- To actually bring the original tenant back into it, use **Reactivate** from their profile instead, which marks them active again and starts a new tenancy in that same room.$body$
where id = '39b7c5ae-3e02-4133-9dbf-34931077713e';

update public.help_blocks set body = $body$Open the tenant and choose **Log Manual Payment**. The **"What's this for?"** dropdown lists the months that aren't fully settled yet, labelled like "September Rent 2026", starting from whichever month they owe first. Pick a month and the amount fills in automatically with what's actually left owing for it -- nudge it up or down in steps of K50 with the plus and minus buttons, or type a figure directly.

Choose how it was paid (**Mobile money** or **Cash**), pick the date it was actually paid, and optionally add a note.

:::note
The note isn't a separate field on the ledger -- it gets folded onto the entry's label in brackets, so it stays visible later when you or the tenant look back at the payment history.
:::

:::warning
The amount can't go above what's genuinely owed for the month you picked. If you try to log more than that, IPM stops you and shows exactly how much is left owing instead. Anything beyond that belongs in a charge or adjustment, not a payment.
:::$body$
where id = '3feb6927-3a0e-469d-88b8-f4ed53a7097c';

update public.help_blocks set body = $body$Only the earliest unpaid month can be selected on its own -- you can't skip ahead and log a future month while an earlier one still has a balance. But if that earliest month is the one selected, a **"Months to pay (advance)"** control appears underneath it. Use the plus button to bundle two or more consecutive months into one log action, for a tenant paying several months in one go.

IPM shows you each covered month and what it will settle before you confirm, and the total is calculated for you rather than typed in.

:::note
Confirming creates **one ledger entry per month covered**, not one combined entry, so each month still shows as properly paid on its own when you look back at the Rent page later.
:::$body$
where id = '252a8e92-bc23-4dc1-b1ca-31d5908284d9';

update public.help_blocks set body = $body$If what you're recording doesn't fit a normal month of rent -- for example a partial month or a deposit top-up -- choose **"Other…"** at the bottom of the month dropdown and type your own label.

:::note
In this case the amount is capped at the tenant's **whole outstanding balance** rather than one month's rent, since there's no single month to measure it against.
:::$body$
where id = 'c758e209-38b8-4b7e-87e8-415fc23025bb';

update public.help_blocks set body = $body$Every tenant on the Rent page shows one of four statuses:

| Status | Meaning |
| --- | --- |
| **Paid** | That month is fully settled. |
| **Overdue** | Nothing has come in and the grace period has lapsed. |
| **Unpaid** | Nothing has come in yet. |
| **Partial** | Some money has come in for the month but not the full amount. |

:::note
Overdue and Unpaid are treated as **equally urgent** and both sort to the top of the list ahead of everyone else.
:::

You can filter the whole page down to just one status using the tabs across the top -- each tab shows its own count so you can see at a glance how many tenants are in trouble without opening every profile.$body$
where id = '592b86b0-76fa-43cb-840e-2ac8cee86147';

update public.help_blocks set body = $body$Under each status is a second line with the actual figures. For the **current month**:

| Status | Shown as |
| --- | --- |
| Overdue | Days overdue + total owed, e.g. "12d · K1,490 owed" |
| Unpaid | Total owed |
| Partial | What's left to clear |

:::note
These figures for the current month include any **late penalty that's accruing right now**, not just the rent itself.
:::

If you switch to a past month using the month switcher, the figures shown are whatever was actually logged that month, with no live penalty added on top, since a penalty only makes sense measured against today. If nothing was ever logged for a tenant in a past month, IPM says "No record this month" honestly rather than guessing from their current status.$body$
where id = '16d3aecb-6b9c-4143-b179-0d345ade3e0b';

update public.help_blocks set body = $body$The **total owed** you see is the tenant's carried-over balance plus whatever late penalty has accrued since their grace period ended -- never a figure that resets to zero on its own.

:::note
That carried-over balance rolls forward month to month until it's actually paid off or adjusted, so it keeps counting a tenant's arrears even after they're marked paid for a new invoice if an older amount is still outstanding.
:::

The summary cards at the top of the Rent page (total expected, collected, outstanding, and the percentage collected) are built from the same per-tenant figures, and the "vs last month" trend is a real comparison against what was actually logged in the previous calendar month, not an estimate, so it's only shown while you're looking at the current month.$body$
where id = '3df0be14-8197-420f-bb3c-60cea2a288b8';

update public.help_blocks set body = $body$When you generate invoices for a month, IPM builds each tenant's invoice from up to three lines:

| Line | When it appears |
| --- | --- |
| **Rent** | Charged for a part month instead of the full month only when that tenant moved in during that exact month and didn't move in on the 1st. |
| **Carried-over balance** | Any balance from before this invoice. |
| **Late penalty** | If one has accrued, labelled with the number of days overdue. |

:::note
A disclaimer at the bottom of the invoice states your current daily rate, shown as a flat amount or a percentage depending on how you've set up late fees in Settings.
:::$body$
where id = 'd8c938e9-6e63-4c18-aa6c-cf1072a0655c';

update public.help_blocks set body = $body$On the review screen, before anything goes out, you can edit the rent figure for any individual tenant.

:::note
This only changes what's printed on that one invoice and **never touches** the rent amount actually on their profile.
:::

If several tenants belong to the same institution, such as a company or school paying on their behalf, switch on **"Group by institution"** to combine them into a single invoice instead of one each.$body$
where id = '858e01ee-7872-4637-baef-871171b87cd0';

update public.help_blocks set body = $body$:::warning
**"Send all"** tries to deliver every invoice over WhatsApp and records each one as sent. Right now, WhatsApp delivery isn't connected to a WhatsApp Business account yet, so **nothing actually reaches the tenant** that way even though the invoice shows as sent. The plumbing is built and ready for when that's switched on -- for now, treat "Send all" as recording the invoice rather than genuinely notifying the tenant.
:::

Use **"Download all"** instead to get a single combined PDF of every invoice, or a ZIP with one PDF per tenant, and share those yourself.$body$
where id = '8d587e24-c517-4413-b495-ced6f23c0bb8';

update public.help_blocks set body = $body$Use **"Add a Charge or Credit"** for anything outside the normal rent cycle -- a damage fine or an extra fee as a charge, or a discount or goodwill gesture as a credit.

:::note
This is different from logging a payment: a **payment** settles something already owed, an **adjustment** changes what's owed in the first place.
:::

You have to fill in what it's for and a reason -- both stay on the tenant's ledger permanently so there's always a record of why their balance moved. A charge adds straight to what they owe, a credit subtracts from it immediately.$body$
where id = '8d3332da-2eb0-466b-8447-8bfda9b77c00';

update public.help_blocks set body = $body$:::warning
You can't delete a ledger entry outright, whether it's a payment, charge, penalty or adjustment.
:::

Instead, open the entry and choose **Void**, and give a reason. The entry stays on the ledger forever, marked as voided and showing when and why, instead of silently disappearing with no trace that it ever happened.

Once voided, that entry no longer counts toward what the tenant owes -- their balance recalculates as if it had never been logged.

:::note
One exception: a charge can't be voided while a payment or another event is still linked to it and actively reducing it. Void that linked entry first, then the charge.
:::$body$
where id = '01d50911-9cb9-4deb-bbb9-db5394f9d385';

update public.help_blocks set body = $body$In Settings you choose how late fees work for your property, or switch them off entirely if you don't charge them. There are three ways to calculate the daily rate:

| Mode | How it's calculated |
| --- | --- |
| **Fixed** | Same flat amount per day, no matter the tenant. |
| **Percent of rent** | A percentage of that specific tenant's rent per day, so a tenant on a bigger room pays a bigger daily fee. |
| **Prorated rent** (default) | That tenant's monthly rent ÷ days in the current month -- e.g. K1,400/month in a 30-day month works out to K46.67/day. |

:::note
Whichever mode you use, the penalty is **days overdue × daily rate**, rounded to a whole number. You can also set a cap in Settings so the penalty never grows past a fixed maximum, however many days a tenant stays overdue.
:::$body$
where id = 'a5c39e2a-4449-4f48-9cdf-2f425a08104d';

update public.help_blocks set body = $body$If you want to let a tenant off their accrued late fee, open their profile and choose **"Waive Late Penalty"**. It shows you exactly how much has accrued and how many days overdue they are before you confirm, and asks for a reason -- a first late payment, an agreed extension, whatever it is -- which stays on their record.

:::note
There's no separate "penalty" figure stored anywhere -- it's always worked out live from how many days a tenant has been overdue, so waiving it works by **resetting that days-overdue count** rather than subtracting an amount. That's also why the penalty on an Overdue tenant's profile can keep climbing day by day until either they pay or you waive it.
:::$body$
where id = 'f881cd81-938c-4651-a6f4-3a5803049efa';

update public.help_blocks set body = $body$Once Autopilot is switched on for your property, it runs once a day and works through a ladder of messages for every tenant who still owes rent:

| When | Message |
| --- | --- |
| Day rent is due | First reminder |
| 1, 3, 7, 14 days late | Each one firmer than the last |
| 14+ days late | Final notice, then repeats **weekly** until paid |

Every message includes a link straight to that tenant's own payment page.

:::note
Only **one stage** goes out per tenant per day, and Autopilot only sends between **8am and 7pm Lusaka time**, so nobody gets a text in the middle of the night. There's also a daily limit on how many texts your property can send in total, so a very large property doesn't blow through its SMS budget in one run.
:::$body$
where id = '1661c965-08ad-4ebe-8939-5824b03ae451';

update public.help_blocks set body = $body$By default, once a tenant hits **14 days overdue**, the automatic ladder has done what it can, and Autopilot stops chasing that tenant on its own. Instead you get one notification and one text naming everyone who reached that point in that day's run together with what they owe in total, rather than a separate alert for each tenant. Open your dashboard from there to see who needs a personal call.

:::tip
If you turn it on in Settings, Autopilot can also text a tenant's emergency contact once they're overdue, but only a few days after you were already notified. It's **switched off by default**, so nothing goes to a guardian unless you deliberately enable it.
:::$body$
where id = '9498e20c-b2a7-4351-8626-0d49ecacacd4';

update public.help_blocks set body = $body$If a tenant has told you they'll pay by a certain date, you don't have to let Autopilot keep texting them in the meantime. Open their **Autopilot badge** and choose to pause it, pick the date it should resume, and optionally leave yourself a note like "promised to pay Friday".

:::note
Nothing goes to that tenant until the date you picked, then the ladder carries on from wherever it would otherwise be. You can update the date or resume early at any time.
:::$body$
where id = '1d1a159c-232b-4775-ad81-39a5e078ebc1';

update public.help_blocks set body = $body$:::tip
The moment every active tenant on your property is paid up for the month, Autopilot sends you a single **"rent complete"** notification and text with the total collected and how many tenants paid, with a link through to your full report -- so you find out without having to go checking tenant by tenant.
:::$body$
where id = 'd10a130d-c7e8-46e3-83f1-df8c1f0e1dfa';

update public.help_blocks set body = $body$Every tenant gets their own payment link -- the same link sent in their rent reminder and Autopilot texts -- that opens straight to their own balance and payment history with no app download and no account to set up. From there they:

1. Choose **MTN, Airtel or Zamtel**.
2. Enter their mobile money number.
3. Choose how much to pay -- their full balance by default, or a smaller amount if they only want to pay part of it.
4. Confirm the prompt that appears on their own phone.$body$
where id = '285e72ea-fd4f-4d62-9f9b-c9ec90639b7b';

update public.help_blocks set body = $body$:::note
The tenant is charged their rent **plus a processing fee** on top of it, and that fee is what covers the cost of the transfer. You only ever receive the rent portion -- it never comes out of what they owed you.
:::

If a tenant pays less than a full month, it is logged against that month as **"Partial"** until a later payment clears the rest, exactly like a partial payment you logged manually yourself.$body$
where id = '6625ffe0-be5f-4a16-9b18-2d88aa97ea4b';

update public.help_blocks set body = $body$:::tip
Once a payment succeeds, it updates the tenant's ledger and balance on your Rent page automatically and the tenant gets their own receipt -- **you don't log anything yourself.**
:::

The money collected this way builds up in your online payments balance, ready for you to transfer out to your bank or mobile money account whenever you like. See the Payouts help articles for how to move it.$body$
where id = '663bd764-999c-442d-acfa-554bd2bf58d4';
