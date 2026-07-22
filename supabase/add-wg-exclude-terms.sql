-- Add WG exclude terms (safe to re-run).
insert into exclude_terms (term) values
  ('wg'),
  ('wohngemeinschaft')
on conflict (term) do nothing;
