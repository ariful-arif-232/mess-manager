-- A snapshot row can be saved while the mess has no Sheet yet (every
-- member's browser pushes after any data change, long before anyone taps
-- "Download Sheets"). Deduping the Google write on "snapshot unchanged"
-- alone then skips the write forever, leaving a permanently blank Sheet.
-- Record which spreadsheet the rows were actually written into instead.
alter table public.mess_sheet_snapshots add column if not exists synced_gsheet_id text;
