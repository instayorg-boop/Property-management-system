-- 20261004000000 added entity_type/entity_id but only populates them for notifications created
-- from that point on — every row written before it still has entity_type/entity_id null, so
-- resolveNotificationLink() (src/landlord/linkResolver.ts) falls back to the category-level route
-- for all of a landlord's older activity instead of deep-linking to the actual tenant or
-- maintenance report. The data to do better was already sitting in `metadata` the whole time.
update public.notifications
   set entity_type = 'maintenance_report',
       entity_id = (metadata->>'maintenance_report_id')::uuid
 where entity_type is null
   and category = 'maintenance'
   and metadata ? 'maintenance_report_id';

update public.notifications
   set entity_type = 'tenant',
       entity_id = (metadata->>'tenant_id')::uuid
 where entity_type is null
   and category = 'payment'
   and metadata ? 'tenant_id';
