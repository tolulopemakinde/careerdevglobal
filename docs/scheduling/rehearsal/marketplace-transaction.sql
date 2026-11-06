-- Rehearsal candidate. Initializes only the marketplace transaction and its audit
-- row. The Paystack and entitlement paths are outside this function.
begin;

CREATE OR REPLACE FUNCTION public.create_marketplace_transaction(p_booking_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tx uuid;
  v_client uuid;
  v_coach uuid;
  v_service uuid;
  v_amount numeric;
  v_currency text;
  v_platform numeric;
  v_coach_share numeric;
  v_platform_fee numeric;
  v_coach_earnings numeric;
BEGIN
  -- Lock the booking before looking up or initializing its unique transaction.
  SELECT b.client_id,b.coach_id,b.service_id
    INTO v_client,v_coach,v_service
  FROM public.marketplace_booking_requests b
  JOIN public.clients cl ON cl.id = b.client_id AND cl.profile_id = auth.uid()
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_tx FROM public.marketplace_transactions WHERE booking_id=p_booking_id;
  IF FOUND THEN
    RETURN v_tx;
  END IF;

  SELECT o.price,o.currency INTO v_amount,v_currency
  FROM public.marketplace_booking_requests b
  JOIN public.coach_service_offerings o ON o.id=b.coach_service_offering_id
    AND o.coach_id=b.coach_id AND o.service_id=b.service_id AND o.active
  WHERE b.id=p_booking_id AND b.booking_status='confirmed'
    AND NOT EXISTS (
      SELECT 1 FROM careerdev_scheduling_private.calendly_operations operation
      WHERE operation.booking_id=b.id AND operation.kind='cancel'
        AND operation.state <> 'succeeded'
    )
  FOR SHARE OF o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Confirmed booking/service offering not available';
  END IF;

  SELECT platform_share_pct,coach_share_pct
    INTO v_platform,v_coach_share
  FROM public.platform_revenue_split_config
  WHERE active=true AND effective_from<=now()
    AND (effective_to IS NULL OR effective_to>now())
  ORDER BY effective_from DESC LIMIT 1;

  IF v_platform IS NULL OR v_coach_share IS NULL THEN
    RAISE EXCEPTION 'No active revenue split configuration';
  END IF;
  IF round(v_platform+v_coach_share,2) <> 100 THEN
    RAISE EXCEPTION 'Invalid revenue split configuration';
  END IF;
  IF v_amount IS NULL OR v_amount < 0 OR v_currency IS NULL OR length(trim(v_currency))=0 THEN
    RAISE EXCEPTION 'Invalid service price or currency';
  END IF;

  v_platform_fee=round(v_amount*v_platform/100,2);
  v_coach_earnings=round(v_amount-v_platform_fee,2);

  INSERT INTO public.marketplace_transactions(
    booking_id,client_id,coach_id,service_id,currency,gross_amount,
    platform_share_pct,coach_share_pct,platform_fee,coach_earnings
  ) VALUES (
    p_booking_id,v_client,v_coach,v_service,v_currency,v_amount,
    v_platform,v_coach_share,v_platform_fee,v_coach_earnings
  ) ON CONFLICT (booking_id) DO NOTHING RETURNING id INTO v_tx;
  IF NOT FOUND THEN
    SELECT id INTO STRICT v_tx FROM public.marketplace_transactions WHERE booking_id=p_booking_id;
    RETURN v_tx;
  END IF;

  INSERT INTO public.marketplace_transaction_events(
    transaction_id,event_type,actor_type,actor_id,event_data
  ) VALUES (
    v_tx,'created','client',auth.uid(),
    jsonb_build_object('gross_amount',v_amount,'currency',v_currency,
      'platform_fee',v_platform_fee,'coach_earnings',v_coach_earnings)
  );
  RETURN v_tx;
END;
$function$;

revoke all on function public.create_marketplace_transaction(uuid) from public, anon, authenticated;
grant execute on function public.create_marketplace_transaction(uuid) to authenticated, service_role;
commit;
