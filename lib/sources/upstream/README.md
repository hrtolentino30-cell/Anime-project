# Private upstream adapter

The production source adapter runs inside Supabase Edge Functions under `supabase/functions/_shared/sources/upstream`.

It centralizes URL classification, metadata parsing, episode parsing and video-source discovery. The Next.js frontend never scrapes the private upstream source directly. The upstream origin itself is stored in Supabase Vault and resolved only by service-role Edge Functions.
