-- Exclude "Suchen/Suche …" wanted ads (safe to re-run).
insert into exclude_terms (term) values
  ('suchen'),
  ('suche')
on conflict (term) do nothing;
