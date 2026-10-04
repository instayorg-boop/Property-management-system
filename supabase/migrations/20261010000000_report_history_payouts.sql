-- Extends report_history.report_type's check constraint to cover the two new report types
-- generate-report learned: "transfers-sent" and "payments-received" (the Payouts page's export
-- flow, generated server-side the same way the Reports hub's existing report types are).
alter table report_history drop constraint report_history_report_type_check;
alter table report_history add constraint report_history_report_type_check
  check (report_type in ('income-expenses', 'occupancy-rate', 'arrears-delinquency', 'transfers-sent', 'payments-received'));
