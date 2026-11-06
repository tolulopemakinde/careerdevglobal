-- One owner approval cannot authorize a second account, even through an operator mistake.
alter table public.ai_billing_test_authorizations
 add constraint ai_billing_test_one_approval unique(approval_reference);
