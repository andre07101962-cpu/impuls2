# 🏗️ Impulse SaaS - Architecture & Developer Guide

**Version:** 1.0 (Foundation)
**Stack:** NestJS, TypeORM, PostgreSQL (Supabase), Redis (BullMQ).

---

## 1. System Overview

Impulse is a **Modular Monolith** designed for Telegram Automation. It allows users to connect their own bots (BYOB), manage channels, and schedule content.

### Key Architectural Decisions:
1.  **Auth Strategy:** Telegram-first authentication (No passwords, No JWT generation). The access token provided by the bot *is* the session key.
2.  **Database Access:** Direct TCP connection (Port 5432/6543) via TypeORM. We do not use Supabase REST API or RLS policies; the Backend acts as a Super-Admin.
3.  **Event-Driven Sync:** Channels are not added manually. The system listens to Telegram Webhooks (`my_chat_member`) to auto-discover channels.
4.  **Async Processing:** Publishing is handled via Redis Queues to ensure reliability and handle rate limits.

---

## 2. Authentication Flow (The "Login" Logic)

We use a custom 2-Factor Authentication flow where Telegram acts as the Identity Provider.

### The Flow:
1.  **Initiation:** User sends `/start` to our Master Bot (`@ice_deep_dive_bot`).
2.  **Generation:**
    *   Server generates a cryptographically strong random token (32 bytes).
    *   Server hashes this token (SHA-256) and saves the **Hash** in the `users` table (`access_token_hash`).
3.  **Delivery:** The Master Bot sends the **Raw Token** to the user via Telegram chat.
4.  **Login:**
    *   User enters `Telegram ID` (Login) and `Raw Token` (Password) on the Frontend.
    *   Frontend sends `POST /auth/login`.
    *   Server hashes the incoming token and compares it with the DB hash.
5.  **Session:**
    *   If valid, the Frontend saves the **Raw Token** in `localStorage`.
    *   All subsequent requests use `Authorization: Bearer <RAW_TOKEN>`.

**Why this way?**
*   Secure: We never store the actual token, only the hash.
*   Stateless: No JWT signing/expiration logic needed. The token is valid until the user requests a new one.

---

## 3. Module Breakdown

### 🤖 Bots Module (BYOB)
**Goal:** Allow users to connect their own Telegram bots.

*   **Security:** User provides a Token from BotFather. We validate it immediately via Telegram API (`getMe`).
*   **Encryption:** The token is encrypted using **AES-256-CBC** (`EncryptionUtil`) before saving to the DB. It is never stored in plain text.
*   **Webhooks:**
    *   When a bot is added, the server automatically calls `setWebhook` on Telegram.
    *   Webhook URL: `https://impyls.onrender.com/bots/webhook/{botId}`.
    *   This allows the user's bot to receive events (like being added to a channel).

### 📢 Channels Module (Event-Driven)
**Goal:** Track channels where the user's bot is an Admin.

*   **Old Way (Deprecated):** User manually types Channel ID -> Server checks admin rights. (Error prone).
*   **New Way (Current):**
    1.  User adds their bot as Admin to a Channel.
    2.  Telegram triggers a `my_chat_member` event to our Webhook.
    3.  `BotUpdatesController` catches this event.
    4.  `ChannelsService` extracts the Channel ID and Title and upserts it into the `channels` table.
    5.  The channel appears on the Frontend automatically via polling.

### 🚀 Publisher Module (Queues)
**Goal:** Reliable post scheduling.

*   **Scheduling:**
    *   Frontend sends payload + time (`POST /publisher/schedule`).
    *   Server saves `Post` (content) and `ScheduledPublication` (metadata) to Postgres.
    *   Server calculates `delay` (Publish Time - Now).
    *   Server adds a job to **BullMQ** (`publishing` queue).
*   **Processing (The Worker):**
    *   `PublishingProcessor` wakes up when the delay expires.
    *   It fetches the publication ID.
    *   It retrieves the *Encrypted Token* of the bot owner.
    *   It decrypts the token.
    *   It sends the payload to Telegram API.
    *   It updates the DB status to `PUBLISHED` or `FAILED`.

---

## 4. Database Schema (TypeORM Entities)

| Entity | Description |
| :--- | :--- |
| **User** | The client account. Stores `telegram_id` and `access_token_hash`. |
| **UserBot** | A bot owned by a User. Stores `token_encrypted`. Linked to User. |
| **Channel** | A Telegram channel. Linked to a `UserBot` (the admin). |
| **Post** | A content template (Text, Media JSON). Can be reused. |
| **ScheduledPublication** | A specific instance of a Post scheduled for a specific Channel. |
| **Campaign** | (Future) Logic for Giveaways/Quests. |
| **AdSlot** | (Future) Marketplace logic. |

---

## 5. Environment Variables & Infrastructure

### Critical Env Vars (.env)
*   `DATABASE_URL`: Connection string for Supabase **Transaction Pooler** (Port 6543). Used for app logic.
*   `DIRECT_URL`: Connection string for Supabase **Session Mode** (Port 5432). Used for TypeORM connections if Pooler fails.
*   `REDIS_URL`: Connection string for Redis (Upstash/Render). Required for BullMQ.
*   `MASTER_BOT_TOKEN`: Token for `@ice_deep_dive_bot`. Used for Auth.
*   `ENCRYPTION_KEY`: 32-char string for AES encryption.

### Deployment (Render)
*   **Build Command:** `npm install && npm run build`
*   **Start Command:** `npm run start` (Production mode)
*   **Health Check:** `GET /` (Returns 404 but proves server is up).

---

## 6. Troubleshooting / Common Pitfalls

1.  **"Tenant or user not found"**:
    *   Cause: Connecting to Supabase Pooler (6543) using a tool that tries to change DB schema.
    *   Fix: Use `DIRECT_URL` (5432) for migrations, or ensure `synchronize: false` in TypeORM config.

2.  **"Circular Dependency"**:
    *   Cause: `BotsModule` imports `ChannelsModule` AND `ChannelsModule` imports `BotsModule`.
    *   Fix: Use `forwardRef(() => ModuleName)` in the `imports` array of `*.module.ts` files.

3.  **Bot not replying**:
    *   Cause: Webhook not set.
    *   Fix: Run `npm run set:webhook <URL>` locally once, or manually call Telegram API `setWebhook`.

4.  **CORS Error**:
    *   Cause: Frontend is on a dynamic domain (Google IDX / Vercel preview).
    *   Fix: `main.ts` has a dynamic CORS handler. Ensure `IS_DEV=true` env var is set if testing from a completely random domain.
