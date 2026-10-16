-- Restructures existing Help & Support article text to use HelpBody's new markdown rendering
-- (tables, bold, callouts via :::note/:::tip/:::warning fences -- see HelpBody.tsx) instead of
-- flat paragraphs. No facts are added or changed here, only how the same information is laid
-- out: naturally tabular info (the five Add-tenant sections, deposit outcomes, CSV columns, sidebar
-- sections) becomes a table, sequences become numbered/bulleted lists, and the one sentence per
-- block that most needs to not get missed becomes a callout.
--
-- First pass: Getting Started + Tenants (the two groups visible in the reference screenshots).
-- The rest of the groups (Rooms, Rent & Payments, Payouts, Maintenance, Expenses, Reports,
-- Account & Settings, Notifications & Tasks) are a follow-up migration, not rewritten here.

update public.help_blocks set body = $body$When you first open Instay Manage, a short setup card greets you on the dashboard with three quick questions:

| Question | Why we ask |
| --- | --- |
| How many beds do you manage? | So we can suggest the right plan. |
| What kind of property do you run? | Student housing, apartments, rooms, a boarding house, or something else. |
| How do you currently collect rent? | Cash, mobile money, bank transfer, or a mix. |

:::note
None of this blocks you from using the app. You can **skip it and come back later**.
:::

The card then turns into a short checklist of what to do next, and you can dismiss it entirely at any time if you'd rather explore on your own.$body$
where id = 'd9b4ad6b-f355-4691-83f4-65da7504a16f';

update public.help_blocks set body = $body$Once you've answered those first questions, the setup card becomes a checklist of concrete next steps:

1. **Add your tenants** first, either by importing a spreadsheet or adding them one at a time -- that's where the rest of the app gets its value.
2. **Confirm your rent due day.** Instay Manage defaults to the **1st of each month**, so check that and change it if your property works differently.
3. **Add a phone number for alerts.** This is where IPM sends you texts about payments coming in and problems that need your attention -- it can be a different number from the one printed on tenant invoices.
4. **Connect a payout account** so rent collected through the app actually reaches you.
5. **Send your first payment link**, once tenants are in, so a tenant can pay from their phone.

Each step shows a done mark as you complete it, and the card disappears once everything is ticked off. You're never blocked from using any other part of the app in the meantime.$body$
where id = 'bb9b3e6a-fa4c-49e7-bcd7-010d437a274c';

update public.help_blocks set body = $body$Once you have **five or more tenants**, or you've sent your first payment link, the checklist offers one more step: turning on Autopilot.

Autopilot sends rent reminders and follow-ups automatically, so you're not manually chasing every tenant yourself.

:::tip
Autopilot is entirely **optional and off by default**. Turn it on from Settings whenever you feel ready, not necessarily on day one.
:::

Everything else in Instay Manage works the same whether Autopilot is on or off -- it simply takes reminder messages off your plate once you switch it on.$body$
where id = '7f3c9a03-8089-4a8e-bb1a-11e74557c47c';

update public.help_blocks set body = $body$Everything in Instay Manage is reachable from the sidebar on the left, grouped into a few plain sections:

| Section | What's in it |
| --- | --- |
| **Daily** | Just your **Dashboard** -- the page you land on, for a quick at-a-glance view of how things stand today. |
| **Operations** | **Rent, Tenants, Rooms, Online payments, Maintenance requests** and your **Expense Tracker** -- the pages you'll use most often. |
| **Insights** | **Reports** -- Overdue rent, Income vs expenses, and Occupancy rate, generated whenever you need them. |
| **Account** | **Settings** -- your property details, billing cycle, notifications and subscription. |
| **Support** | **Help & Support** -- exactly where you are now. |$body$
where id = 'f4b5aa4f-edcd-4924-abc8-d0969af71e6c';

update public.help_blocks set body = $body$Two other things worth knowing about aren't tucked away in the sidebar at all -- they sit directly on your **Dashboard**.

- The **bell icon** and the **Recent activity** card show you notifications as they happen.
- **Today's Tasks** surfaces the handful of things that actually need your attention right now, sorted by how urgent they are.

:::note
You don't need to go hunting for either -- they're the first things you see every time you open the app.
:::$body$
where id = 'a0d5b41b-4361-48c5-ab83-49b08a1683fc';

update public.help_blocks set body = $body$The top of your dashboard shows three quick figures:

| Tile | What it shows |
| --- | --- |
| **Total collected** | How much rent has come in. |
| **Outstanding balance** | What's still owed to you -- turns **red** whenever it's above zero, so trouble is easy to spot. |
| **Rooms occupied** | Rooms occupied against your total room count. If you haven't set up rooms yet, shows your tenant count instead, so the tile is never empty. |

Tap any of these three and you're taken straight to the relevant page -- Rent, Rooms, or Tenants -- to look closer.$body$
where id = '0a0e0639-f6ff-49a6-baf6-d0daf1eb983f';

update public.help_blocks set body = $body$Below the top numbers sits **Today's Tasks**, a short list the system builds for you each day from things like overdue rent, maintenance requests sitting too long, or a collections rate below your target.

Each one is ranked **high, medium, or low** priority so you tackle the right thing first, and you can mark one done or snooze it if it isn't for today.

Underneath that, **Recent activity** shows the latest notifications -- payments coming in, maintenance reports, anything worth knowing about -- with a link through to the full Notifications page if you want the complete history.$body$
where id = 'f095978c-25ae-4984-9486-d407f72e0192';

update public.help_blocks set body = $body$On the right side of the dashboard:

- **Online payments** shows your current Lenco balance -- money collected through the app that hasn't been transferred to your bank yet -- with a **Transfer to bank** button right there when you're ready to move it.
- A breakdown of **this month's expenses** by category gives you a quick sense of where money is going out, without needing to open the full Income vs expenses report.$body$
where id = 'fb5fa799-1e50-4311-b225-da1a6a889d4d';

update public.help_blocks set body = $body$Open **Tenants** and click **Add tenant**. The form is one continuous page split into five sections:

| # | Section | Covers |
| --- | --- | --- |
| 1 | Personal | Name, phone numbers, emergency contacts, photo |
| 2 | Property | Room, move-in date, rent |
| 3 | Deposit | Security deposit amount and collection |
| 4 | Lease and billing | Due day, grace period, late fee |
| 5 | Documents | Tenancy agreement, ID, and other files |

Start with the tenant's **name** and **at least one phone number**.

:::note
The phone number matters: rent reminders, receipts, payment links and property updates are all sent to this number by SMS -- double check it before saving.
:::

You can add more than one phone number and as many emergency contacts as you need, each with its own name, relationship and phone numbers. A photo is optional -- skip it and the tenant's profile shows an initials avatar instead.$body$
where id = '8c3004d0-d7ee-4492-a8ba-4ffd97d4f194';

update public.help_blocks set body = $body$The **Property** section asks where this tenant is staying and from when. Pick a move-in date, then choose a room from the picker, which only lists rooms with a free bed. If a shared room already has one tenant in it, it still shows up with its remaining capacity.

Picking a room **fills in that room type's rent automatically**, though you can still edit it for this tenant if their terms are different.

- No room types set up yet? The form shows an **Add room type** shortcut instead of the picker.
- No fixed room list? Leave **Room** blank, type the rent by hand, and optionally describe the unit in free text, like "Back house" or "Flat 2".

:::tip
If the move-in date lands anywhere other than the 1st of the month, IPM shows a **mid-cycle move-in notice** and lets you either charge a prorated amount for the partial month or waive it so the first real charge starts next month.
:::$body$
where id = '30910108-7460-4ed9-b97f-71f1ce093aa3';

update public.help_blocks set body = $body$The **Deposit** section asks whether this tenant needs to pay a security deposit. Choosing **Charge security deposit** defaults the amount to that room type's deposit, but you can adjust it for this tenant. You then record whether it was actually collected today and, if so, how (mobile money or cash).

**Lease and billing** terms are pre-filled from your property's own billing settings in Settings -- specifically the rent due day and grace period -- but you can override both for this particular tenant if their agreement is different.

:::note
IPM shows the resulting late fee rate directly on the form: once the grace period lapses, the **daily late fee = monthly rent ÷ days in that month**.
:::

For a tenant moving in on the 1st of a normal billing cycle, the form instead asks whether any rent was collected today, and if so, the amount and payment method -- so their very first month is recorded accurately rather than left open.$body$
where id = 'f93c9166-5765-4f42-b7f6-1634c7d293c1';

update public.help_blocks set body = $body$**Notes** are landlord-only: use them for payment arrangements or anything else worth remembering about this tenant. They never go out to the tenant or appear on their portal.

**Documents** lets you attach a tenancy agreement, national ID, acceptance letter, or anything else worth keeping on file. This is optional and can be added later from the tenant's profile.

:::tip
When you click **Add tenant**, IPM saves the record and takes you straight to the new tenant's profile. If you've turned on the welcome SMS setting in **Settings -> Messages to tenants**, a text goes out automatically with their payment portal link -- you don't need to generate or send that link yourself.
:::$body$
where id = 'c90fdc03-4c46-42ef-9dde-4269ca52b1bb';

update public.help_blocks set body = $body$From a tenant's profile, click the edit pencil on **Personal**, **Tenancy**, or **Emergency contact**, or open the full edit page directly -- reached the same way you added them, now pre-filled. The form keeps the same five sections as Add tenant, with a few differences once a tenant already exists:

- **Property** no longer asks for a move-in date, since that's set once at move-in and changed later through **Move out** and **Reactivate** instead. The room picker still only offers vacant beds, but adds back the tenant's own current room so you can see and keep it selected.
- **Documents** behave differently too: files you attach while editing upload and attach immediately, and you can delete any document already on file, rather than staging everything until you save.$body$
where id = '8da8f6b7-24b1-4e7b-80c8-f0e5bed22f5d';

update public.help_blocks set body = $body$Editing exposes two fields **Add tenant** hides: the security deposit date and, when a deposit is owed, a **bank transfer** option alongside mobile money and cash as the deposit method. Both only matter if this tenant has a deposit recorded.

Lease and billing terms -- the rent due day and grace period -- can be changed here at any time, and the late fee preview updates immediately to show the new daily rate.

:::warning
Change these carefully: moving the due day or grace period changes how soon a payment is flagged late **going forward**, and does **not** retroactively adjust any penalty that has already accrued.
:::$body$
where id = '02944cec-123e-4c2f-a722-0b2e19ace293';

update public.help_blocks set body = $body$:::note
Saving changes updates the tenant's **stored details only**. It never creates a new ledger entry or touches their balance -- editing rent or deposit terms here does not charge, refund, or adjust anything already on their record.
:::

If you need to add a one-off charge, credit, or record a payment, use the actions on the tenant's profile instead of this form. A successful save shows a **Tenant updated** confirmation and takes you back to the tenant's profile.$body$
where id = '3a09fdb9-57f7-4b31-b923-ecf152bde3bc';

update public.help_blocks set body = $body$Moving a tenant out marks them **inactive** and immediately frees up their room: Rooms pulls its occupancy straight from which tenants are currently active and assigned, so there's no separate step to release the bed.

:::note
Their full payment history -- every charge, payment, credit and waiver -- stays on their record and stays visible from their profile. **Nothing is deleted.**
:::

You'll find **Move out** as an action on the tenant's profile. It asks for the move-out date, which defaults to today but can be backdated, and what happened to their security deposit:

| Outcome | Meaning |
| --- | --- |
| Refunded | Full deposit returned |
| Partially refunded | Some of the deposit returned |
| Forfeited | Deposit kept |$body$
where id = 'b0a7d429-995b-431b-a6ce-81fa13720196';

update public.help_blocks set body = $body$Pick whichever deposit outcome matches what actually happened, then add a short reason or note -- for example *"K200 deducted for cleaning"*. If you leave the note blank, IPM fills in a sensible default based on the outcome you chose, such as "Refunded in full". This note is what shows up later if you or anyone else looks back at why that tenant's deposit was resolved the way it was.

Confirming the move out saves everything at once. The tenant moves to the **Moved out** tab on the Tenants page, and the room they were in shows as vacant and ready to assign to someone new.$body$
where id = '9261a749-5de7-4132-bc16-339a7f8e3d93';

update public.help_blocks set body = $body$There are two ways to end a tenancy, and they're **not identical**:

| Action | Where | What it does |
| --- | --- | --- |
| **Move out** | Tenant's profile | Lets you record the move-out date and resolve the security deposit properly. |
| **Delete tenant** | Three-dot menu on the Tenants list | Skips all of that -- immediately archives the tenant, marking them inactive with today's date as the move-out date and **no deposit outcome recorded**. |

:::tip
Either way the tenant is never actually deleted -- their history is kept, and they can be reactivated later. For a clean record, especially where a deposit is involved, use **Move out** from their profile rather than the quick Delete action on the list.
:::$body$
where id = 'd0afc9ce-87ab-4c04-b51e-810129b153e5';

update public.help_blocks set body = $body$If someone who moved out comes back, you don't need to add them as a brand new tenant. Open their profile from the **Moved out** tab on Tenants and choose **Reactivate**. The only thing you're asked for is a new move-in date, which defaults to today.

Confirming sets the tenant active again in the same room they were in before, and starts a fresh tenancy from that new move-in date. Their move-out date is cleared, along with any deposit resolution note left over from when they left, since that chapter is now closed.

:::note
Everything else on their record -- name, phone numbers, rent amount, lease terms, and their entire payment history -- stays exactly as it was.
:::$body$
where id = 'f8ce6802-bfa2-44db-9522-d6105223a593';

update public.help_blocks set body = $body$:::warning
Reactivating a tenant does **not** check whether their old room is still free.
:::

If someone else has since moved into it, you'll want to update the tenant's room and rent from the edit page right after reactivating them, the same way you would for any other tenant whose details changed. Rooms only shows a bed as occupied based on which active tenants are actually assigned to it, so an outdated room value here can make the Rooms page look wrong until you fix it.$body$
where id = '7f62e21e-86bc-438e-9772-c5a79f05c0b2';

update public.help_blocks set body = $body$From **Tenants**, click **Import**. Download the template CSV first -- it has one column per field IPM understands, with an example row showing the format:

| Field | Required? |
| --- | --- |
| Full name | Required |
| Phone | Required |
| Monthly rent | Required |
| Unit | Optional |
| Move in date | Optional |
| Deposit | Optional |
| Gender | Optional |
| Guardian name & phone | Optional |

:::tip
If your spreadsheet already has similarly named columns -- e.g. "Tenant" or "Mobile" instead of "Full name" or "Phone" -- IPM will usually recognize and map them automatically once you upload. You can always check or fix the mapping yourself before importing.
:::

Excel files aren't read directly: save as CSV first, or just copy your cells and paste them in. Phone numbers get normalized to the standard Zambian format automatically, and dates are read **day first**, so `01/09/2025` is read as the 1st of September, not January.$body$
where id = 'cb334105-625e-4222-9997-685aee0c9b6c';

update public.help_blocks set body = $body$:::warning
Every tenant brought in this way starts **fully paid up to today**, with nothing owing, regardless of what they actually owed you before.
:::

Their first real rent charge is generated on your property's next normal due date, and reminders only start from then. If someone genuinely owes money from before you started using IPM, add that as a charge from their profile after the import finishes, rather than trying to represent it in the spreadsheet.

Rows get flagged before anything is saved:

| Flag | Meaning |
| --- | --- |
| **Error** | That row will not be imported at all (a missing name, an unreadable phone, a duplicate of a tenant you already have). |
| **Warning** | Still imports, but something was assumed -- e.g. today's date standing in for an unreadable move-in date. |

You can download the flagged rows to fix and re-upload them separately.$body$
where id = 'a497bd9b-d1e7-42a6-aa46-a6122c4d36ab';

update public.help_blocks set body = $body$Before you confirm the import, you choose whether to text everyone with a phone number their welcome message and payment link right away, or hold off and send it later yourself. Either way, each tenant's portal link is already generated by the time the import finishes.

:::tip
If something about the import was wrong -- the wrong file, or the wrong default rent -- use **Undo this import** right after it completes. It removes every tenant that batch created, but only the ones who have not had any real activity since, like a payment or a manually added charge. Anyone with activity is kept rather than risk losing real financial history.
:::$body$
where id = 'c9c9928b-c617-4bfd-a94a-4edcdb7f7723';

update public.help_blocks set body = $body$Every tenant gets their own payment link automatically the moment you add them, whether you add them one at a time or through a bulk import. It's a short, stable code tied to their record, in the form `portal.instayhomes.com/p/` followed by a six-character code, and it never changes for as long as that tenant exists.

:::note
You don't need to generate this link, copy it anywhere, or send it manually unless you want to.
:::

If the welcome SMS setting is turned on in **Settings -> Messages to tenants**, IPM texts a new tenant their link automatically as soon as they're added. The same link also appears on invoices and payment receipts sent by SMS. Opening it takes the tenant straight to their own payment portal, with no account or app install needed on their end.$body$
where id = 'd2660111-cca3-48a7-9024-8a1ccc550047';
