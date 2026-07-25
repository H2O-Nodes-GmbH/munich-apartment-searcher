# Munich Apartment Searcher

Personal Next.js tool that polls [Kleinanzeigen](https://www.kleinanzeigen.de) rental search URLs for Munich, stores new listings in Supabase, filters swap/Untermiete noise, and notifies via Telegram.

## Status

Built so far:

- Supabase schema (`supabase/schema.sql`)
- Cheerio scraper (selectors verified against live search HTML)
- Manual test route: `GET /api/scrape/test`
- Telegram notifier module (wired when env vars are set)
- Vercel cron stub every 20 min (`/api/cron/poll` — not implemented yet)

Still to build: persist listings, dashboard UI, full cron + notify loop, auth gate.

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. `cp .env.example .env.local` and fill values.
3. `npm install && npm run dev`

### Scrape test (no DB writes)

```bash
# Dev: auth is open if CRON_SECRET is unset
curl -s "http://localhost:3000/api/scrape/test" | jq '.listingCount, .listings[0]'

# With your own search URL + exclusion preview
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/scrape/test?applyExclude=1&url=$(python3 -c 'import urllib.parse; print(urllib.parse.quote(\"YOUR_SEARCH_URL\", safe=\"\"))')" \
  | jq '{listingCount, excluded: [.listings[] | select(.isExcluded)] | length, sample: .listings[0]}'
```

The scraper appends `sortingField=SORTING_DATE` so posted timestamps (`Heute, 20:57`, etc.) appear on cards.

### Telegram

1. Message [@BotFather](https://t.me/BotFather) → create a bot → copy token → `TELEGRAM_BOT_TOKEN`
2. Add the bot to a shared group (recommended) or DM it
3. Set `TELEGRAM_CHAT_ID` to that chat id (group ids look like `-100…`). Get it via `https://api.telegram.org/bot<token>/getUpdates` after sending a message in the chat
4. Optional: comma-separate multiple ids to notify a group and DMs at once

### Exclude terms

Seeded in SQL (edit in Supabase anytime):

`tausch`, `swap`, `tauschwohnung`, `wohnungstausch`, `tauschobjekt`, `mietertausch`, `untermiete`, `zwischenmiete`

Möbliert is **not** excluded. Matched listings are stored with `is_excluded = true`, not dropped.

## Project layout

```
src/lib/scraper/     # fetch + parse — update parseListings.ts when markup changes
src/lib/notifications/  # TelegramNotifier (+ Notifier interface for later channels)
src/app/api/scrape/test  # manual scrape smoke test
supabase/schema.sql
```

## Deploy

Vercel Pro supports the 20-minute cron in `vercel.json`. Set the same env vars in the Vercel project. Protect cron with `CRON_SECRET` (Vercel sends `Authorization: Bearer $CRON_SECRET`).
