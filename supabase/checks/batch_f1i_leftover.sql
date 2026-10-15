-- Batch F1i: leftover check. Run after batch_f1i_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back.

SELECT
  (SELECT count(*) FROM public.phone_verify_attempts
   WHERE phone_hash IN (repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64))) AS test_attempts,
  (SELECT count(*) FROM public.profiles WHERE phone_number = '+99900000001') AS test_numbers,
  (SELECT count(*) FROM public.profiles WHERE stripe_customer_id = 'cus_F1ITEST') AS test_customer_ids;
