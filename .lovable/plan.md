# Fix duplicate Dubai (and Adelaide) city chats

## What's actually happening

There are two Dubai rooms in the database:

- "Dubai / UAE" (created 1 Sep, 0 messages)
- "Dubai / United Arab Emirates" (created 2 Sep, 1 message)

The uniqueness rule we added does work — but it's applied to a key built as `city-country` using whatever country text is present. The seeded rooms use country abbreviations (`dubai-uae`, `london-gb`, `adelaide-au`), while rooms auto-created when a Nomad saves their profile use the full country name from Google Places (`dubai-united arab emirates`). Two different strings, so the database treats them as two different cities and the unique rule never fires.

Adelaide has the same problem: `adelaide-au` and `adelaide-australia`.

## The fix

1. **Normalise the key to the city only, plus a cleaned country.** Build the key from a slugified city name and a canonical country, so "UAE" and "United Arab Emirates" resolve to the same room. Practically: match on the slugified city first, and only treat rooms as distinct if the countries are genuinely different places.
2. **Merge the existing duplicates.** For each duplicate pair, keep the room that has messages (the newer Dubai one), move any messages from the other room across, then delete the empty duplicate. Same for Adelaide (both empty — keep the older one, use the full country name for display).
3. **Enforce it at the database level.** A trigger recomputes `city_key` on insert/update from the normalised city + country, so the existing unique rule can no longer be bypassed by a different country spelling. Room creation from the profile save then simply resolves to the existing room.
4. **Tidy the seeded rooms** so every room displays a full country name ("United Arab Emirates", "United Kingdom", "Australia") rather than a code, keeping the list consistent.

## Technical notes

- New `public.city_chat_key(p_city text, p_country text)` immutable helper: lowercase, trim, strip accents/punctuation, collapse spaces to hyphens; country passed through a small alias map (uae → united arab emirates, uk/gb → united kingdom, usa/us → united states, au → australia, etc.).
- `BEFORE INSERT OR UPDATE` trigger on `city_chat_rooms` sets `city_key = public.city_chat_key(city, country)`.
- Data migration: repoint `city_chat_messages.room_id` from duplicate rooms to the surviving room, delete duplicates, backfill country names, then recompute all `city_key` values.
- Drop the redundant duplicate index (`idx_city_chat_rooms_city_key` / `city_chat_rooms_city_key_unique` overlap with `city_chat_rooms_city_key_key`), keeping one unique index.
- `src/pages/EditSitterProfile.tsx`: keep the upsert but let the trigger own `city_key` (still pass a value; the trigger overwrites it), so no duplicate is created regardless of the country spelling Places returns.
