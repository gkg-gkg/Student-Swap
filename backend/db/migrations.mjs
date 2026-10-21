// Schema migrations, applied in order by db/migrate.mjs and recorded in schema_migrations. Never edit one that has
// been deployed: add a new entry instead. Money is integer pence, times are timestamptz (UTC). See handoff §5.

export const migrations = [
  {
    id: '001_events_uploads_listings',
    sql: /* sql */ `
      create table regions (
        id text primary key,
        name text not null,
        live boolean not null default false
      );
      create table cities (
        id text primary key,
        region_id text not null references regions(id),
        name text not null
      );
      create table universities (
        id text primary key,
        city_id text not null references cities(id),
        name text not null,
        short text not null,
        email_domains text[] not null
      );
      create table venues (
        id text primary key,
        name text not null,
        city_id text not null references cities(id),
        area text not null,
        kind text not null check (kind in ('club', 'students_union', 'live_venue'))
      );

      -- id = Cognito sub. Created by the post-confirmation trigger (or on first GET /me).
      create table users (
        id text primary key,
        email text not null unique,
        display_name text,
        university_id text references universities(id),
        avatar_tone text,
        avatar_initials text,
        profile_complete boolean not null default false,
        age_confirmed_at timestamptz,
        rating_avg numeric(3, 2) not null default 0,
        rating_count integer not null default 0,
        completed_sales integer not null default 0,
        notification_prefs jsonb not null default '{"offers": true, "orders": true, "alerts": true, "marketing": false}',
        stripe_account_id text,
        -- Filled in by the Stripe step (handoff §7). Listing requires 'complete' unless REQUIRE_PAYOUTS=false.
        connect_status text not null default 'not_started' check (connect_status in ('not_started', 'pending', 'complete')),
        created_at timestamptz not null default now()
      );

      create table events (
        id text primary key,
        title text not null,
        description text not null default '',
        venue text not null,
        venue_id text references venues(id),
        city_id text not null references cities(id),
        university_ids text[] not null default '{}',
        type text not null check (type in ('club_night', 'ball', 'social', 'gig')),
        starts_at timestamptz not null,
        last_entry_at timestamptz not null,
        ends_at timestamptz not null,
        age_restriction text not null default '18+',
        id_requirement text not null,
        tone text not null,
        created_by text references users(id),
        created_at timestamptz not null default now(),
        check (ends_at > starts_at)
      );
      create index events_ends_at on events (ends_at);
      create table ticket_tiers (
        id text primary key,
        event_id text not null references events(id) on delete cascade,
        name text not null,
        face_value_pence integer not null check (face_value_pence >= 100),
        position integer not null
      );
      create index ticket_tiers_event on ticket_tiers (event_id);

      create table event_alerts (
        user_id text not null references users(id),
        event_id text not null references events(id) on delete cascade,
        created_at timestamptz not null default now(),
        primary key (user_id, event_id)
      );
      create table event_requests (
        id text primary key,
        user_id text not null references users(id),
        name text not null,
        venue text not null,
        date text not null,
        note text,
        dismissed boolean not null default false,
        created_at timestamptz not null default now()
      );

      -- One row per presigned upload. The ticket-scan Lambda fills in the result and the fingerprint.
      create table uploads (
        key text primary key,
        owner_id text not null references users(id),
        purpose text not null check (purpose in ('ticket', 'evidence')),
        file_name text not null,
        content_type text not null,
        size_bytes integer not null,
        status text not null default 'checking' check (status in ('checking', 'passed', 'needs_review', 'rejected')),
        message text,
        reasons jsonb not null default '[]',
        file_hash text,
        image_hash text,
        codes text[] not null default '{}',
        created_at timestamptz not null default now(),
        scanned_at timestamptz
      );

      create table listings (
        id text primary key,
        event_id text not null references events(id),
        tier_id text not null references ticket_tiers(id),
        seller_id text not null references users(id),
        quantity integer not null check (quantity between 1 and 6),
        price_pence integer not null check (price_pence >= 100),
        face_value_pence integer not null,
        delivery text not null check (delivery in ('pdf', 'transfer')),
        transfer_platform text,
        file_key text references uploads(key),
        file_name text,
        barcode_check text check (barcode_check in ('checking', 'passed', 'needs_review', 'rejected')),
        status text not null check (status in ('draft', 'under_review', 'active', 'reserved', 'sold', 'expired', 'removed')),
        review_note text,
        review_reasons jsonb not null default '[]',
        ai_assisted boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        -- Defence in depth for the face-value cap (pricing.maxPriceMultiplier = 1.0). Change both together.
        check (price_pence <= face_value_pence),
        check (delivery <> 'pdf' or file_key is not null)
      );
      create index listings_event_status on listings (event_id, status);
      create index listings_seller on listings (seller_id, created_at desc);
      create index listings_status_created on listings (status, created_at);

      -- What each listed ticket looks like, for duplicate detection (handoff §9).
      create table ticket_fingerprints (
        listing_id text primary key references listings(id),
        file_hash text not null,
        image_hash text,
        codes text[] not null default '{}'
      );
      create index ticket_fingerprints_file_hash on ticket_fingerprints (file_hash);
      create index ticket_fingerprints_codes on ticket_fingerprints using gin (codes);
    `,
  },
];
