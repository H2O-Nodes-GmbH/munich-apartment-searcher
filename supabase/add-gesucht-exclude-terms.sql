-- Exclude Kleinanzeigen "Gesuch" wanted ads (safe to re-run).
insert into exclude_terms (term) values
  ('gesucht'),
  ('gesuch')
on conflict (term) do nothing;
