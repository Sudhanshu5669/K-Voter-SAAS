# K-Voter SaaS — Setup Guide (Buy Me a Coffee Edition)

Follow this step-by-step guide to configure the databases, payments, authentication, and hosting to get K-Voter live in less than 30 minutes.

---

## 1. Database Setup (Supabase)

1. Create a free account at [supabase.com](https://supabase.com) and create a new project.
2. In the sidebar, navigate to the **SQL Editor** &rarr; click **New Query**.
3. Paste the following SQL schema to create the tables, enable Row Level Security, and set up the automatic profile creation trigger:

```sql
-- 1. Create public.users table (linked to auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  discord_username TEXT NOT NULL,
  email TEXT,
  encrypted_token TEXT,
  token_iv TEXT,
  token_tag TEXT,
  customer_id TEXT UNIQUE,
  subscription_id TEXT UNIQUE,
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  selected_bots TEXT[] NOT NULL DEFAULT '{karuta}',
  last_vote_at TIMESTAMPTZ,
  last_vote_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create public.vote_logs table
CREATE TABLE public.vote_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  bot_key TEXT,
  status TEXT NOT NULL,
  detail TEXT,
  voted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row-Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vote_logs ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies (Users can only view their own data)
CREATE POLICY "Users can view their own user profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can view their own vote logs" ON public.vote_logs
  FOR SELECT USING (auth.uid() = user_id);

-- 5. Set up trigger to auto-create user profile on OAuth sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, discord_username, email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      'Discord User'
    ),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

4. Click **Run** to execute the query.

> **Already have an older database?** If your `users` / `vote_logs` tables were created before multi-bot support, run this migration once to add the new columns:
> ```sql
> ALTER TABLE public.users
>   ADD COLUMN IF NOT EXISTS selected_bots TEXT[] NOT NULL DEFAULT '{karuta}';
> ALTER TABLE public.vote_logs
>   ADD COLUMN IF NOT EXISTS bot_key TEXT;
> ```

5. In Supabase Dashboard &rarr; **Settings** &rarr; **API**, copy these values:
   - **Project URL** (`SUPABASE_URL`)
   - **Project API Keys - `anon` `public`** (`SUPABASE_ANON_KEY`)
   - **Project API Keys - `service_role`** (`SUPABASE_SERVICE_ROLE_KEY`) (Keep this secret)

---

## 2. Authentication Setup (Discord OAuth)

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a **New Application** (e.g. "K-Voter").
2. Go to the **OAuth2** tab in the sidebar:
   - Copy the **Client ID**.
   - Reset and copy the **Client Secret**.
3. Under **Redirects**, add this URL (replace `<your-project-id>` with your Supabase project ID):
   - `https://<your-project-id>.supabase.co/auth/v1/callback`
   - Click **Save Changes**.
4. Go back to your **Supabase Dashboard** &rarr; **Authentication** &rarr; **Providers** &rarr; **Discord**:
   - Toggle **Enabled** to ON.
   - Paste the **Client ID** and **Client Secret** you copied from Discord.
   - Click **Save**.

---

## 3. Payment Setup (Buy Me a Coffee Memberships)

Using Buy Me a Coffee bypasses the need for Stripe developer API access. It handles payment routing (supporting credit cards, local UPI, Google Pay, Apple Pay, and PayPal) and payouts directly to your existing Stripe Connect Express account.

1. Log into your account at [buymeacoffee.com](https://buymeacoffee.com).
2. Go to the **Memberships** section:
   - Create a membership tier (e.g., named `K-Voter Premium` or `Automatic Cooldown Votes`).
   - Set the monthly pricing (e.g. ₹149 or $1.99).
   - Save the tier.
3. Copy your Membership link. It will look like:
   - `https://buymeacoffee.com/<your-username>/membership`
   - This will be your `BMC_MEMBERSHIP_URL`.

---

## 4. Key Generation

On your computer terminal, run this command to generate secure 32-byte hex keys:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run it **twice**:
- Use the first output string as your `ENCRYPTION_KEY` (Used for encrypting/decrypting session cookies).
- Use the second output string as your `CRON_SECRET` (Used to protect your `/api/cron/vote` endpoint).

---

## 5. Webhook Setup (Buy Me a Coffee Webhooks)

Once you deploy your app on Vercel, configure webhooks in your Buy Me a Coffee account:
1. Navigate to the Buy Me a Coffee **Developers** or **Webhook Settings** tab.
2. Click **Create New Webhook**:
   - **Webhook URL**: `https://<your-vercel-domain>.vercel.app/api/buymeacoffee/webhook`
   - **Secret Key**: Create a secure password here. This will be your `BMC_WEBHOOK_SECRET`.
   - **Events to Select**: Check the boxes for:
     - `Membership started`
     - `Membership cancelled`
3. Save the Webhook.
4. Use their built-in **"Send Test"** button to dispatch a test `membership.started` payload to verify your serverless function is configured correctly.

---

## 6. Hosting Deployment (Vercel)

1. Make this directory a git repository, push it to GitHub/GitLab.
2. Log into [Vercel](https://vercel.com) &rarr; **Add New** &rarr; **Project** &rarr; Import your repository.
3. Keep root directory as default (the project root, containing `package.json` and `vercel.json`).
4. Expand **Environment Variables** and add all the values:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
BMC_WEBHOOK_SECRET=your-webhook-secret-defined-in-bmc
BMC_MEMBERSHIP_URL=https://buymeacoffee.com/username/membership
ENCRYPTION_KEY=<your-first-generated-key>
CRON_SECRET=<your-second-generated-key>
FRONTEND_URL=https://<your-vercel-domain>.vercel.app
NODE_ENV=production
```

5. Click **Deploy**. Vercel will install dependencies, build the backend serverless endpoints, and distribute your frontend static files automatically.

---

## 7. Cron Trigger Configuration

To execute votes, configure an external tool to call your backend `/api/cron/vote` endpoint:

### Option A: cron-job.org (Recommended - Easiest & Free)
1. Go to [cron-job.org](https://cron-job.org) and register a free account.
2. Go to **Cron Jobs** &rarr; **Create Cron Job**:
   - **Title**: `K-Voter Cron`
   - **URL**: `https://<your-vercel-domain>.vercel.app/api/cron/vote`
   - **Schedule**: User-defined / Every 6 hours (`0 */6 * * *`)
   - Under **Request Headers**, add:
     - Header: `x-cron-secret`
     - Value: `<your-cron-secret>`
3. Click **Create**.

### Option B: GitHub Actions
Create a repository secret named `CRON_SECRET` and add a workflow file `.github/workflows/trigger.yml` in your repo:
```yaml
name: Trigger Vote Cron
on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger endpoint
        run: |
          curl -X GET \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://<your-vercel-domain>.vercel.app/api/cron/vote
```

---

## 8. Adding More Bots (Karuta, Sofi, …)

The stored token is a **Top.gg session cookie** tied to the user's Top.gg account — not to any single bot — so one token can vote for any number of bots. Adding a new bot is a one-file change:

1. Open **`backend/src/config/bots.js`** and add an entry to the `BOTS` object:
   ```js
   sofi: {
     key: 'sofi',              // short slug, stored in the DB + admin UI
     name: 'Sofi',             // display name
     entityId: '...',          // Top.gg GraphQL entity id (see below)
     botId: '853629533855809596', // number in the top.gg/bot/<botId>/vote URL
   },
   ```
   - `botId` is the number in the bot's vote URL: `https://top.gg/bot/<botId>/vote`.
   - `entityId` is Top.gg's internal GraphQL id. To find it: open the vote page, open DevTools → **Network**, click **Vote**, and inspect the `api.top.gg/graphql` request payload — the `entityId` / `i` variable is the value you need. (It is **not** the same as the `botId`.)
2. Redeploy. The new bot immediately appears in the **Admin Panel → User Management → Bots** column.
3. For each user, click the bot chips to assign which bots they should be voted for. Green = assigned. Assigning multiple bots casts a vote for each of them on every cron run.

New/legacy users default to **Karuta** until you change their assignment. Removing a bot from `bots.js` is safe — stale keys stored on users are ignored automatically.
