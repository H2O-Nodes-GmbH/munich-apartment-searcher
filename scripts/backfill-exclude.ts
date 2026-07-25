import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { matchExcludeTerms } from "../src/lib/exclude";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env");

const sb = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { transport: ws as unknown as typeof WebSocket },
});

async function main() {
  const { error: insertError } = await sb.from("exclude_terms").upsert(
    [
      { term: "wg" },
      { term: "wohngemeinschaft" },
      { term: "gesucht" },
      { term: "gesuch" },
      { term: "suchen" },
      { term: "suche" },
    ],
    { onConflict: "term", ignoreDuplicates: true },
  );
  if (insertError) throw insertError;

  const { data: terms } = await sb.from("exclude_terms").select("term");
  const excludeTerms = (terms ?? []).map((t) => t.term as string);

  const { data: listings, error } = await sb
    .from("listings")
    .select("id, title, description_snippet, is_excluded");

  if (error) throw error;

  let changed = 0;
  for (const row of listings ?? []) {
    const match = matchExcludeTerms(
      { title: row.title, descriptionSnippet: row.description_snippet },
      excludeTerms,
    );
    const { error: upErr } = await sb
      .from("listings")
      .update({
        is_excluded: match.isExcluded,
        matched_exclude_terms: match.matchedTerms,
      })
      .eq("id", row.id);
    if (upErr) throw upErr;
    if (match.isExcluded !== row.is_excluded) changed++;
  }

  const visible = (listings ?? []).filter((l) => {
    const m = matchExcludeTerms(
      { title: l.title, descriptionSnippet: l.description_snippet },
      excludeTerms,
    );
    return !m.isExcluded;
  });

  console.log(
    JSON.stringify(
      {
        total: listings?.length ?? 0,
        changed,
        visible: visible.length,
        newlyExcluded: (listings ?? [])
          .filter((l) => {
            const m = matchExcludeTerms(
              { title: l.title, descriptionSnippet: l.description_snippet },
              excludeTerms,
            );
            return m.isExcluded && !l.is_excluded;
          })
          .map((l) => l.title),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
