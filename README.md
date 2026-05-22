# noterooms

Temporary public chat rooms. Create a room with a duration (1h–7d), share the link, chat with anyone.

## Stack
- **Next.js 15** (App Router)
- **Supabase** (Postgres + service role API)
- **Vercel** (deployment)

## Setup

### 1. Supabase
Run `supabase/schema.sql` in your Supabase SQL Editor.

### 2. Environment variables
Copy `.env.example` → `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_SECRET=your-chosen-admin-password
```

### 3. Run locally
```bash
npm install
npm run dev
```

### 4. Deploy
Push to GitHub and connect to Vercel. Add env vars in Vercel dashboard.

## Routes
| Route | Description |
|---|---|
| `/` | Lobby — list + create rooms |
| `/room/[slug]` | Room chat with reply support |
| `/admin` | Admin panel (password-protected) |

## Admin
Visit `/admin`, enter `ADMIN_SECRET`. Can view all rooms + messages, delete either.

## Features
- Temp rooms with configurable expiry (5min–7 days)
- Reply to messages (quoted preview)
- Image URL embeds
- Anonymous session IDs
- Admin panel: stats, room list, message list, delete
- Room FK cascades delete messages on room deletion
