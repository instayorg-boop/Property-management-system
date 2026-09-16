-- Widens ledger_entries.source to also allow 'adjustment' — a manually-applied balance change
-- (an ad-hoc charge like a damage fine, or a credit/waiver like clearing an accrued late penalty)
-- that isn't a rent payment being settled. Kept as its own source rather than overloading
-- 'manual', since TenantsContext.tsx's addAdjustment/waivePenalty need to tell these apart from an
-- actual logged payment (e.g. so the ledger UI shows a "Charge"/"Credit" tag instead of a
-- paid/partial/overdue/unpaid status pill, and so a future "undo" only ever targets adjustments).
--
-- Additive: existing rows are untouched (all currently 'manual' or 'lenco', both still allowed).

alter table public.ledger_entries drop constraint if exists ledger_entries_source_check;
alter table public.ledger_entries add constraint ledger_entries_source_check check (source in ('manual', 'lenco', 'adjustment'));
