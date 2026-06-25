# K-Voter — Premium Karuta Auto-Voting SaaS (Buy Me a Coffee Edition)

K-Voter is a fully automated, commercial-grade Software-as-a-Service (SaaS) application designed to automate voting for the Karuta Discord bot on Top.gg. 

It provides an end-to-end subscription business, allowing developers to monetize a convenient, set-and-forget service for active Discord players using Buy Me a Coffee as the billing engine.

---

## 🌟 Core Features

- **No Browser Required:** Votes are cast using direct HTTP GraphQL mutations to Top.gg APIs, running in under a second per user. No heavy Playwright or headless Chrome setups.
- **Top-Tier Security:** Users' session cookies are encrypted at rest using AES-256-GCM. Decryption occurs only in volatile memory during the active API execution.
- **Buy Me a Coffee Integration:** Integrated with Buy Me a Coffee memberships. Supporter subscription statuses are synced instantly via BMC webhook events.
- **Hassle-Free Indian Setup:** Bypasses direct Stripe signup constraints. You can accept payments via card, UPI, or PayPal on Buy Me a Coffee, which automatically payouts to your Stripe Express Connect account.
- **Detailed Execution Logs:** Provides users with a live log history of their voting timestamps, success badges, and cooldown intervals.

---

## 📂 Project Directory Structure

```
k-voter-saas/
├── backend/
│   ├── api/
│   │   └── index.js             # Vercel Serverless Function entry point
│   └── src/
│       ├── app.js               # Express application initialization
│       ├── config/              # Client configurations (Supabase client)
│       ├── middleware/          # Security (JWT and Cron auth handlers)
│       ├── routes/              # API endpoints (Auth, User, Buy Me a Coffee, Cron)
│       └── services/            # Core business logic (Voting, Encryption)
│
├── frontend/
│   ├── index.html               # Sleek Cyberpunk landing page
│   ├── dashboard.html           # Glassmorphism user dashboard
│   ├── css/
│   │   └── styles.css           # Custom design system and animations
│   └── js/
│       ├── auth.js              # Auth & session manager (Supabase SDK)
│       ├── app.js               # Landing page CTA scripts
│       └── dashboard.js         # Dashboard interactivity and logs display
│
├── vercel.json                  # Routing config for unified Vercel deployment
├── package.json                 # Node dependencies and scripts
├── .env.example                 # Documented template for configuration keys
└── SETUP_GUIDE.md               # Detailed account setup instructions
```

---

## 🛠️ Tech Stack

- **Backend:** Express.js (runs as Vercel Serverless functions)
- **Database & Auth:** Supabase (PostgreSQL with Row Level Security)
- **Payments:** Buy Me a Coffee Webhooks (No SDK needed, parses payloads timing-safely)
- **Frontend:** Pure HTML5, CSS3 (Glassmorphic variables), and Vanilla JavaScript
- **Security:** Node `crypto` AES-256-GCM
- **Deployment:** Vercel (Hobby/Free tier compatible)

---

## 🚀 Quick Start

1. Copy this `k-voter-saas/` folder into a separate repository.
2. Initialize it as a git repository and push it to GitHub/GitLab.
3. Follow the comprehensive instructions in [SETUP_GUIDE.md](SETUP_GUIDE.md) to set up your Buy Me a Coffee, Supabase, Discord, and Vercel environments.
