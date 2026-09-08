-- One-off test fixture: a K1/month room type with no deposit, on Great East Student Lodge, so a
-- real end-to-end mobile-money payment can be tested cheaply against the live Lenco sandbox
-- instead of using a real rent-sized amount. Not part of the seed data proper — a deliberate,
-- separate addition for payment-flow testing.

insert into public.room_types (property_id, name, capacity, rent, deposit_amount, deposit_refundability)
values ('d0fb56b4-25c7-40cd-a085-607b759b295f', 'Test Room (K1)', 1, 1, 0, 'Non-refundable')
returning id;
