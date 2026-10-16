-- Final pass of the rich-formatting rewrite: Payouts & Withdrawals, Maintenance, Expenses,
-- Reports, Account & Settings, Notifications & Tasks (6 groups, 43 blocks). Same approach as
-- 20261015130000/20261015140000: restructure existing wording into tables/bold/callouts, no
-- facts added or changed, using real em dashes (not "--", see HelpBody.tsx's normalizeDashes
-- for why that no longer matters either way).

update public.help_blocks set body = $body$From the **Online payments** page, choose **Bank**, then search for your own bank from the list and enter your account number.

:::note
Before anything is saved, IPM resolves the account and shows you the account holder's name it got back, so you can check it's really your own account before you confirm it.
:::$body$
where id = '2f630e19-9c35-4007-bac6-bca15de403ca';

update public.help_blocks set body = $body$Choose **MTN, Airtel or Zamtel** and enter the number — the same resolve-then-confirm step applies here too, showing you the name registered on that number before you save it.

:::tip
You can save more than one payout method at a time — a bank account and a mobile money number together — and switch which one is the default from **Manage** whenever you like.
:::$body$
where id = '6e208876-55eb-4653-8fb6-9def9b54d686';

update public.help_blocks set body = $body$:::warning
Before either a bank account or a mobile money number is actually saved, IPM emails a **6-digit code** to your account's registered email address, valid for **5 minutes**, and you have to enter it to finish. This isn't just a screen you click through — it's checked on the server, so a new payout method genuinely can't be added without access to that email inbox.
:::

Make sure you've set an account email in Settings first — this step can't run without one.$body$
where id = '7279c4d4-a750-4772-9aa8-c3908463cca5';

update public.help_blocks set body = $body$The **Online payments** page shows what's actually available to withdraw right now — rent that's been collected and hasn't been paid out yet, already net of the collection fee.

If you've saved more than one payout method, pick which one to send it to, then confirm you want to transfer it.$body$
where id = '328566d4-f898-4d36-948e-50652ea52d90';

update public.help_blocks set body = $body$Sending money out uses the same email confirmation code as adding a new payout method: a **6-digit code** sent to your account email, good for **5 minutes**, with a limit of **5 requests an hour** so it can't be spammed.

:::note
Entering the correct code is what actually authorizes the transfer on IPM's side — nothing moves until you do.
:::$body$
where id = '9794ed29-94eb-4f2b-a7db-2a14381cca94';

update public.help_blocks set body = $body$Every transfer carries the real transfer fee charged by Lenco, IPM's payment partner, plus a flat **K5** on top specifically for an on-demand transfer you request yourself — a scheduled or automatic payout doesn't carry that extra K5.

:::tip
The amount that actually goes out can end up slightly less than what you asked for if your real available balance had changed by the time it processed, so always check the **net amount** IPM shows you after sending rather than assuming it matches exactly what you typed in.
:::$body$
where id = 'a1b15b96-0051-4ccc-bbb7-5be7768ca7c0';

update public.help_blocks set body = $body$| Status | Meaning |
| --- | --- |
| **Pending** | Still moving |
| **Completed** | Arrived |
| **Failed** | Didn't go through, with a reason shown if one was given |

:::note
Failed and Pending transfers always appear at the **top** of your recent payouts list regardless of their date, since those are the ones that actually need your attention — a long-settled Completed transfer doesn't need to compete for attention further down the list.
:::$body$
where id = '0df18900-b7f9-41a5-8e95-bdafb3e76c38';

update public.help_blocks set body = $body$After you send a transfer, IPM checks its progress automatically for about a minute. If it's still not resolved by then, it tells you it's **"still processing"** rather than guessing at an outcome.

:::warning
Don't send the same transfer again in the meantime.
:::

Opening that transfer again later actively re-checks the real status with Lenco rather than only reading what IPM last recorded, so a transfer that was sitting at Pending can resolve itself the next time you look, even without you doing anything.$body$
where id = '8f2198cd-46a0-4fb1-8e6b-7b018e682f95';

update public.help_blocks set body = $body$The reason is shown if Lenco gave one — a closed account or an invalid number are common ones.

:::tip
Before you hit **"Try again"**, it's worth double checking that payout method's details are still correct, since retrying runs through the same confirmation code step again and will fail the same way if the underlying account or number is the actual problem.
:::$body$
where id = '3b831ae5-7837-49f3-ad53-31116b86acb7';

update public.help_blocks set body = $body$Tenants submit maintenance requests from their own payment portal: they pick or type a location, describe the issue, and can attach photos — no phone call or separate app needed. You can also log a request yourself from the **Maintenance** page, for something you noticed on a walk-through rather than something a tenant reported, using the same location, description and photo fields.

Every new request starts with **Open** status.

:::note
Priority (**Low, Medium, High or Urgent**) is never chosen by whoever files it. It starts at Medium and is then set automatically based on the location and description, usually within moments, so an actual emergency should surface as High or Urgent on its own without anyone having to flag it by hand. You can still change the priority yourself afterward from the request if you disagree with it.
:::$body$
where id = '597214d8-9956-4827-ab81-c54ebc9b2035';

update public.help_blocks set body = $body$The request list is sorted to put the most pressing things first: open requests before in-progress ones, before resolved ones, and within each status, the most urgent first. Filter by status (**All, Open, In progress, Resolved**) from the filter menu above the list, or search by location or description.

Move a request forward with the **advance** action on each row, which steps it from Open → In progress → Resolved in order. Open a request directly to see its full description, photos, which tenant reported it (if any), edit its location, description or priority, or change its status from a drawer instead of stepping through in order.

:::note
Marking something Resolved records the exact time it was closed, which is what the resolved view and your exports are built from.
:::

:::tip
If a request turned into a real cost — for example paying a plumber — log it separately as an expense so it shows up in your expense tracking too.
:::$body$
where id = 'dba15623-742c-4c1b-8643-cdca5e27583d';

update public.help_blocks set body = $body$From the expense tracker, click **Add expense**. You need a **name** (for example "Plumber, Room 08 leak"), an **amount**, and a **category**; everything else — a longer description, a receipt photo — is optional.

Every property starts with a set of default categories:

| Category |
| --- |
| Maintenance and Repairs |
| Taxes |
| Operations and Security |
| Marketing |
| Admin and Travel |
| Salaries |
| Finance and Mortgages |

:::tip
You're not limited to the defaults. Click **New category** right from the form to add one on the spot — for example "Generator fuel" — and it's immediately available to pick for this and future expenses.
:::

The date defaults to today but can be changed to log something you paid for earlier. Attach a photo of the receipt if you have one — it uploads straight from the form and shows as a thumbnail you can remove and re-attach before saving if you picked the wrong image.$body$
where id = '29937942-120b-45fb-ae61-43bae37be1c4';

update public.help_blocks set body = $body$Open any logged expense to edit its name, amount, category, date, description or receipt the same way you added it, or delete it entirely, which cannot be undone.

:::note
A category can only be deleted once it has **zero expenses** logged against it. Otherwise, disable it instead from category management: a disabled category stops showing up as an option for new expenses but keeps every existing expense correctly labeled with it.
:::

Expenses logged this way are always marked as manually entered. If your property also runs payroll through IPM, those costs appear in the same expense list automatically with their own source, so your totals stay complete without double entering anything.$body$
where id = '894a8a89-1e1e-4688-873d-af27424d0c6a';

update public.help_blocks set body = $body$The **Expenses this month** chart on your dashboard is a snapshot of the current calendar month only, grouped by category. Each slice of the donut is one category, sized by how much you've spent against it so far this month, with the busiest categories getting their own color and anything beyond the top six categories folded into a single **Other** slice so the chart stays readable.

Hover over any slice, or its label underneath, to see that category's exact amount and its share of the month's total in the center of the donut. Move away and the center goes back to showing the month's overall total.

:::note
Because it only covers the current month, the chart resets at the start of each new month and will show nothing until you log at least one expense dated within it.
:::$body$
where id = 'fdf90444-819e-40cd-b429-468541924b36';

update public.help_blocks set body = $body$Click any category in the legend below the chart to go straight to the expense tracker, already filtered to that category, so you can see exactly which individual expenses make it up rather than just the total.

:::note
The **Other** slice is not clickable since it's not really one category, just the smaller ones folded together — open the expense tracker directly and sort by category if you need to see what's in it.
:::

For a full history beyond this month, or to compare months, use the expense tracker's own filters rather than this card.$body$
where id = '2fc7cd95-4419-4e77-af67-9b386d3669e2';

update public.help_blocks set body = $body$**Reports**, under Insights in the sidebar, is where you generate a formal view of your property's numbers rather than just browsing the live dashboard.

| Report | Shows |
| --- | --- |
| **Overdue rent** | Who's behind on rent and by how much |
| **Income vs expenses** | A full income and expense statement for a chosen month |
| **Occupancy rate** | How many rooms and beds are filled |

Each one opens as its own card from the Reports page — pick a report, then choose the time period and format you want before generating it.$body$
where id = '33bbbb77-1466-4661-b4fc-516855550b1e';

update public.help_blocks set body = $body$When you generate a report, you choose a date range — **annually, by a specific month, or a custom start and end date** — and then a format, either **CSV** or **PDF**.

:::note
CSV gives you the raw numbers to open in a spreadsheet. PDF gives you a formatted document that looks the same as the on-screen preview, ready to print or send on as is.
:::

Once generated, you land on a preview of the finished report with a **Download** button, and a **Generate another** link if you want to try a different period without starting over from the Reports page.$body$
where id = '9971afc7-ccb8-4ed3-8762-0c353c98621e';

update public.help_blocks set body = $body$Every report you generate is saved to the **Report history** tab on the Reports page, so you don't have to run the same report twice. From there you can download it again at any time, and a PDF also has a **View** button that opens it directly in your browser instead of downloading it first.

:::tip
Reports are listed with the period they cover and when they were generated, so it's easy to find the right one even months later.
:::$body$
where id = 'fa9cfdf0-9576-451d-90fa-c1278ffa1675';

update public.help_blocks set body = $body$**Overdue rent** answers one question: who hasn't paid, and how bad is it. It lists every tenant currently behind, their room, how many days overdue they are, how much they still owe, and their emergency contact.

:::note
At the top, two summary figures give you the whole picture at once: the **number of tenants behind on rent** and the **total amount owed** across all of them.
:::

Use this report whenever you want a complete, current list of everyone who needs chasing, rather than checking each tenant's page one by one.$body$
where id = '2abbc25d-5b4b-40b5-af94-9a97e5a2ba9c';

update public.help_blocks set body = $body$Each tenant's days overdue shows as a colored badge:

| Badge | Meaning |
| --- | --- |
| Amber | Under 15 days behind |
| Red | 15 days or more |

:::tip
That color split is a useful way to triage who to follow up with first — a tenant a few days late is a different conversation from one who's weeks behind.
:::

You can sort the list by days overdue or by amount owed, and search by tenant name or room, so with a longer tenant list you can quickly narrow in on who matters most right now.$body$
where id = '3035a583-7195-4f4c-a4fe-d99d540af0de';

update public.help_blocks set body = $body$Next to each tenant's emergency contact, you'll see **Call** and **WhatsApp** buttons. Call opens your phone's dialer with the number already filled in, and WhatsApp opens a chat with that contact on WhatsApp — Zambian mobile numbers are converted automatically so you don't need to re-type anything.

:::tip
That means you can go from seeing who's overdue to actually reaching their contact in one tap, right from the report itself.
:::$body$
where id = '37eb3f91-5122-4636-ba98-95055db40922';

update public.help_blocks set body = $body$**Income vs expenses** is the statement you'd hand an accountant at month end — it answers how much came in, how much went out, and what's left over.

At the top, three figures show **rent collected**, **total expenses**, and the **net** for the month. Below that, expenses are broken down by category, each with its own subtotal — for example Maintenance or Utilities — so you can see not just how much you spent but where it went.

:::note
A bold **Net** line at the bottom is the real bottom line for the month you're looking at.
:::$body$
where id = '346419a2-e0ba-400a-96f5-cbd6b8f534d7';

update public.help_blocks set body = $body$Use the month switcher above the report to move backward and forward through time, or jump straight back to the current month.

:::warning
Expense figures are accurate for any month you look at, since every expense is logged with its own date. Rent collected, however, currently only reflects live, present-day tenant status, so looking at a past month shows a dash instead of a figure for rent collected, with a note explaining this on screen. Expenses for that month are trustworthy — the income side for that same past month is not yet tracked historically.
:::$body$
where id = '7af7e124-a41e-454b-8a5d-64a9a7eeed72';

update public.help_blocks set body = $body$Like every report, you can generate Income vs expenses as a **CSV** for a spreadsheet or a **PDF** to keep or send on, choosing a monthly, annual, or custom date range when you generate it.

:::note
It's saved to your Report history afterward too, so if you need last quarter's statement again, you don't need to regenerate it from scratch.
:::$body$
where id = 'e96264c1-08dc-44e5-8e2e-86442569bb53';

update public.help_blocks set body = $body$**Occupancy rate** answers how full your property currently is, overall and by room type.

At the top, three figures summarize it: **occupied beds** against your total, **vacant beds**, and your overall **occupancy rate** as a percentage. Below that, a table breaks the same numbers down by each room type you've set up, so you can see at a glance where your vacancies actually are rather than just one blended number for the whole property.$body$
where id = 'ea8205fa-e022-41b7-a5f1-4243862f929b';

update public.help_blocks set body = $body$:::tip
A single property-wide occupancy percentage can hide a real problem — you might be at 90% overall while one specific room type sits half empty.
:::

Breaking the numbers down by room type is what makes this report useful for decisions like where to focus marketing, or whether a particular room type is priced right for how well it's filling.

:::note
This report reflects your current, live occupancy — it's a snapshot of right now rather than a trend over time.
:::$body$
where id = 'a3b0221f-3cc1-44af-abd0-b98fa5fef11e';

update public.help_blocks set body = $body$Under Settings you can edit your property's **name, address, type** (student housing, apartments, rooms or boarding house, or other) and upload a **logo** that shows up in the sidebar and on every tenant-facing page, including the payment portal.

:::warning
Your property name can only be changed **three times** — this is enforced by the system itself, not just a limit in the screen, so make sure it's right before you've used up your changes.
:::

:::note
Your payment portal link, however, is fixed once your property is created and never changes even if you rename the property later, so links you've already shared with tenants keep working.
:::$body$
where id = 'c531f585-ef29-45c6-ba31-706f7af48b69';

update public.help_blocks set body = $body$Your **landlord name and phone number** appear on tenant invoices, and you can list the payment methods you accept — mobile money, cash, bank transfer, or anything else — which show up on invoices under **How to pay**.

:::tip
Your **notification phone**, where IPM texts you about payments and problems, is kept separate from your landlord phone, so you can route alerts to a different number from the one printed for tenants if that works better for you.
:::$body$
where id = '9d2757bc-a3f9-4b0b-8601-d1ddb7f3ca6f';

update public.help_blocks set body = $body$Settings also controls the rules behind how rent is collected: your **billing period**, the **due day** each cycle, a **grace period** before a payment counts as late, and whether late fees apply automatically — either a flat daily rate, a percentage of rent, or a prorated amount, with an optional cap.

:::note
If you manage a property on someone else's behalf, you can also set a **management fee rate** — the percentage taken off gross rent before what's left goes to the owner as a payout.
:::

These settings drive reminders, penalties and payouts throughout the rest of the app, so it's worth checking them against how your property actually runs.$body$
where id = '6530caf9-d0c0-4c9e-8e03-a370fd4a31ee';

update public.help_blocks set body = $body$From Settings, open **Change password**.

:::note
You'll need to enter your current password first — this confirms it's really you before anything changes, so an unattended, signed-in laptop can't be used to take over your account.
:::

Your new password needs to be **at least 8 characters**, include both letters and numbers, and be different from your current one — a checklist on screen ticks off each requirement as you type so you can see exactly what's left. Confirm the new password a second time, and once everything matches, select **Update password**.$body$
where id = 'c14aceab-bf42-4c86-bc59-a74f3b913713';

update public.help_blocks set body = $body$:::tip
If you don't remember your current password, you don't need to guess — select **"Forgot it? Email me a reset link"** right on the Change password screen.
:::

That sends a reset link to the email address on your account, and you can set a new password from there instead of needing your old one at all.$body$
where id = '4c4dc1a4-5d6e-49ff-8126-82b32f1ce607';

update public.help_blocks set body = $body$IPM has three subscription tiers:

| Plan | Beds | Staff logins | Highlights |
| --- | --- | --- | --- |
| **Starter** | Up to 80 | 2 | Tenant & room management, automatic rent collection, reminders, maintenance management, reports, up to 200 SMS/month |
| **Growth** | 81-299 | 5 | Everything in Starter, plus unlimited reminders, advanced reports and analytics |
| **Enterprise** | 300+ | Unlimited | Everything in Growth, plus custom invoice branding |

Each is priced per month with its own one-time setup fee. The **Billing** page under Settings shows your current plan and what it includes.

:::note
To move to a different tier, select **Request a plan change**, choose the plan you want and add a note — the IPM team will reach out to make the change, it isn't an instant self-service switch.
:::$body$
where id = '129f94c1-932e-47b4-a8c7-05d616b38b9e';

update public.help_blocks set body = $body$Your current invoice, if one is due, shows at the top of Billing with its amount and due date. Select **Pay now**, enter the mobile money number to pay from — **MTN Money, Airtel Money or Zamtel Kwacha** are all detected automatically from the number — and confirm.

:::tip
You'll be prompted on your phone to approve the payment, and the Billing page checks for confirmation automatically so you don't need to refresh.
:::

If you're all paid up, this section simply tells you so, with nothing further to do.$body$
where id = 'e34cb3c5-ead6-499d-a49f-fbf54d2fb11a';

update public.help_blocks set body = $body$Every past invoice is listed below your current one, with its period, amount and status — **paid, overdue, pending, or waived**.

:::note
This gives you a running record of what IPM has billed you and when each one was settled, useful if you ever need to check back on when a particular month's subscription fee was paid.
:::$body$
where id = '8d09b5c7-132d-4586-967b-134e127b2250';

update public.help_blocks set body = $body$Your **Activity log**, reachable from Settings, is a running record of everything meaningful that happens on your account. It covers four kinds of events:

| Category | Covers |
| --- | --- |
| Financial activity | Payments logged, adjustments, waived penalties, payouts |
| Tenant record changes | A tenant being added, updated, moved out, or reactivated |
| Settings changes | Changes to your property, billing or notification settings |
| Login and access events | Including password changes |

:::note
Each entry shows what happened, who did it, and exactly when, in plain language rather than raw technical detail, so you can scan it quickly rather than decode it.
:::$body$
where id = '9cde7405-d42c-4363-a746-b411daf6f936';

update public.help_blocks set body = $body$You can filter the log by category — financial, tenant records, settings, or login and access — and clear your filters at any time to see everything again.

:::note
The log only shows activity for your property and is visible to you as the landlord — it's your own record of what's happened on your account, not something tenants or anyone outside your account can see.
:::$body$
where id = '7d91b90d-1d5a-471e-983a-d0fa154f4162';

update public.help_blocks set body = $body$:::warning
Every entry in the Activity log is **permanent**. There's no option to edit or delete a past entry, by anyone, including you, because the log is meant to be a trustworthy record of what actually happened, not something that can be quietly rewritten after the fact.
:::

If you ever need to explain a number or a decision later, your activity log is the one place that record genuinely can't have been altered.$body$
where id = '1c7562d0-ef11-4bff-aae4-de4c1ea7399c';

update public.help_blocks set body = $body$Instay Manage notifies you about the things that actually need your attention: a new payment coming in, a new maintenance report from a tenant, an overdue account that's been escalated, payouts, and reminders.

:::note
You'll see them appear live on your dashboard the moment they happen, no refresh needed, and the bell icon keeps a running unread count so you always know if there's something you haven't looked at yet.
:::

Selecting **View all activity**, or the bell itself, takes you to the full Notifications page with your complete history, not just the handful shown on the dashboard.$body$
where id = '55ca2265-bee2-43fd-b319-176a0a0299c0';

update public.help_blocks set body = $body$On the full Notifications page, you can switch between **all notifications** and **unread only**, filter by category (payment, maintenance, payout, overdue, system or reminders), and narrow by date (today, the last 7 days, or the last 30).

Mark a single notification read as you deal with it, or use **Mark all read** to clear everything at once.

:::tip
In Settings, you can also choose which events actually generate a notification in the first place — new payment, new maintenance report, and overdue escalated can each be switched on or off independently, so you only get notified about what matters to you.
:::$body$
where id = 'e6dbcf0a-2ad6-43db-bec4-637d20f5ad60';

update public.help_blocks set body = $body$Separately from in-app notifications, Settings lets you choose which of these events also text you, using a phone number you set for alerts, which can be different from the number printed on tenant invoices.

:::note
Payment notifications by SMS come as a **digest** — hourly, daily, or switched off entirely — rather than one text per payment, so you're not flooded with messages on a busy collection day.
:::

Maintenance reports and escalated overdue accounts can each be turned on or off for SMS separately from their in-app notification setting.$body$
where id = '4b494afc-1a34-481d-b43f-e9af44a559dd';

update public.help_blocks set body = $body$**Today's Tasks**, on your dashboard, is a short list the system builds for you each day from real conditions on your property, not a model guessing what might matter. It can surface:

- Overdue rent
- Maintenance requests that have sat too long without action
- Your collections rate falling below the target you've set
- Partial payments
- Unsettled deposits
- Vacancies
- A payout that's ready to send
- Gaps in your data worth filling in

:::note
Each task is scored and sorted into **high, medium or low** priority, so the thing most worth your attention sits at the top rather than buried in a long list.
:::$body$
where id = '2b215ac1-3a04-403d-81e7-1d84cd1a382a';

update public.help_blocks set body = $body$Each task links straight to where you'd act on it — for example an overdue rent task takes you to that tenant. Once you've handled something, **mark it done**, or **snooze** it for a few days if it's not something you can deal with right now but don't want to lose track of.

:::tip
You can also add your own task manually, for things no automatic detector would ever catch, like calling an electrician, and give it its own priority and due date alongside the automatic ones.
:::$body$
where id = 'f9e6d723-6f21-4f62-888a-96b6ebbd93fe';

update public.help_blocks set body = $body$If a particular kind of task isn't useful for how you run your property, Settings lets you switch off individual detectors — **overdue rent, stale maintenance, or collections below target** — independently of each other.

:::note
Turning one off just stops that type of task from being generated. It doesn't affect any of the others or any task you've added yourself.
:::$body$
where id = '8e3ac778-ad42-4227-a3a2-8a6730ec6d23';
