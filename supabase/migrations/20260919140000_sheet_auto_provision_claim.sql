-- A mess's Google Sheet is now created by the first data change that needs
-- one, instead of waiting for someone to tap "Download Sheets". That means
-- several browsers can reach the create step for the same mess at once, so
-- they race on this claim: exactly one wins the conditional update in
-- mess-sheet's ensureSheet(), creates the Sheet and records its id, and the
-- rest skip creating and pick the id up on their next sync. A claim left
-- behind by a function that died is retried once it goes stale.
alter table public.messes
  add column if not exists gsheet_claim_at timestamptz;

comment on column public.messes.gsheet_claim_at is
  'Taken while an edge function is creating this mess''s Google Sheet, so only one caller creates it; cleared once the id is stored, and reclaimable when stale.';
