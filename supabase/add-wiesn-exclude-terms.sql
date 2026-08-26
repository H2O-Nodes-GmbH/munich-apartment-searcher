-- Exclude Oktoberfest ("Wiesn") short-term sublets (safe to re-run).
insert into exclude_terms (term) values
  ('wiesn'),
  ('oktoberfest')
on conflict (term) do nothing;
