
# 📘 Impulse API — Ultimate Frontend Developer Guide

**Version:** 2.1 (Added Verification)
**Base URL:** `https://impyls.onrender.com` (or `http://localhost:3000` for local dev)  
**Auth Strategy:** Telegram-Native (No passwords, No JWT).

---

## 1. 🔐 Authentication Flow

We do not use email/password. The user's identity is their Telegram account.

### Step 1: User gets credentials (Outside of Web App)
1.  User opens our Master Bot: `@ice_deep_dive_bot`.
2.  User sends `/start`.
3.  Bot replies with:
    *   **Login ID:** `123456789` (Their Telegram ID)
    *   **Access Token:** `f8a9d...` (A 64-char secure token)

### Step 2: Login Page
Create a form accepting `Telegram ID` and `Token`.

**Request:**
`POST /auth/login`
```json
{
  "telegramId": "123456789",
  "token": "f8a9d..."
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "user": {
    "id": "uuid-string",
    "telegramId": "123456789",
    "role": "user",
    "subscriptionTier": "free"
  }
}
```

### Step 3: Session Management
*   **Save the `token`** (the one the user entered) in `localStorage`.
*   **Header:** Attach it to **ALL** subsequent requests.
    ```text
    Authorization: Bearer <TOKEN_FROM_LOCAL_STORAGE>
    ```

### Step 4: Verify Session (Get Profile)
`GET /auth/me`
*   Returns the user object if the token is valid.
*   Returns `401 Unauthorized` if invalid (redirect to login).

---

## 2. 🤖 Bots Module (BYOB - Bring Your Own Bot)

Users connect their own bots (via BotFather) to manage their channels.

### List User Bots
`GET /bots`
*   Returns an array of connected bots.

### Connect New Bot
`POST /bots`
*   User pastes a token from BotFather.
*   Backend validates it immediately with Telegram.

**Payload:**
```json
{
  "token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
}
```

### Update Bot Config
`PATCH /bots/:id/config`
*   Update the welcome message sent when people start the *user's* bot.

**Payload:**
```json
{
  "welcomeMessage": "Welcome to my awesome shop! 🚀"
}
```

---

## 3. 📢 Channels Module

**⚠️ CRITICAL UI/UX NOTE:**
There is **NO "Add Channel" button** where the user types a Channel ID.
Instead, we use **Auto-Discovery**.

### How to add a channel:
1.  User goes to Telegram.
2.  User adds their Bot (from Section 2) as an **Administrator** to a Channel.
3.  Telegram sends a webhook to Backend.
4.  Backend automatically creates the channel in the DB.
5.  Frontend just needs to refresh the list.

### List Channels
`GET /channels`

**Response:**
```json
[
  {
    "id": "-1001234567890",
    "title": "My News Channel",
    "photoUrl": "https://api.telegram.org/file/...", // Can be null
    "membersCount": 5420,
    "isActive": true,
    "bot": {
        "username": "my_assistant_bot" // The bot managing this channel
    }
  }
]
```

### 🆕 Manual Verification (Full Health Check)
Use this when the user clicks a "Verify" or "Refresh Status" button on a specific channel. This performs a complete circle check (Permissions, Stats, Avatar).

**Endpoint:** `POST /channels/verify`
**Payload:**
```json
{
  "botId": "uuid-of-bot",
  "channelId": "-100123456789"
}
```

**Responses:**
*   **201 Created (Success):** Returns updated channel object. Status is confirmed Valid.
*   **400 Bad Request:** "Bot is no longer an Admin". The backend automatically sets `isActive: false`. Update the UI to show the channel as disconnected (Red).

---

## 4. 🚀 Publisher (Scheduling Posts)

This is the main feature. It supports Text, Photos, Albums (Carousels), and Buttons.

**Endpoint:** `POST /publisher/schedule`

### Common Fields
All requests must include:
*   `publishAt`: ISO 8601 Date String (e.g., `2025-10-20T15:30:00.000Z`).
*   `channelIds`: Array of strings `["-100...", "-100..."]`.
*   `content`: The payload object (see below).

---

### Scenario A: Simple Text Post
```json
{
  "publishAt": "2025-12-25T10:00:00.000Z",
  "channelIds": ["-1001234567890"],
  "content": {
    "text": "Hello world! This is a test."
  }
}
```

### Scenario B: Single Photo + Caption + Buttons
*   `media`: String URL.
*   `buttons`: Array of Arrays (Rows of Columns).

```json
{
  "publishAt": "2025-12-25T10:00:00.000Z",
  "channelIds": ["-1001234567890"],
  "content": {
    "text": "<b>Check out this product!</b>", // HTML Allowed
    "media": "https://example.com/image.png",
    "buttons": [
      [
        { "text": "Buy Now ($10)", "url": "https://stripe.com" },
        { "text": "More Info", "url": "https://google.com" }
      ],
      [
        { "text": "Support", "url": "https://t.me/support" }
      ]
    ]
  }
}
```

### Scenario C: Media Album (Carousel)
*   `media`: Array of String URLs.
*   **Note:** Telegram does NOT support Buttons with Albums. If you send both, buttons will likely be ignored or cause an error.

```json
{
  "publishAt": "2025-12-25T10:00:00.000Z",
  "channelIds": ["-1001234567890"],
  "content": {
    "text": "Here is a gallery of images", // Caption applies to first image
    "media": [
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
      "https://example.com/3.jpg"
    ]
  }
}
```

---

## 5. 🛠️ TypeScript Interfaces (Copy-Paste)

Use these in your frontend application.

```typescript
// --- AUTH ---
export interface User {
  id: string;
  telegramId: string;
  role: 'user' | 'admin';
  subscriptionTier?: string;
}

// --- BOTS ---
export interface Bot {
  id: string;
  username: string;
  telegramBotId: string;
  status: 'active' | 'revoked' | 'flood_wait';
  config: {
    welcomeMessage?: string;
  };
}

// --- CHANNELS ---
export interface Channel {
  id: string; // BigInt sent as String
  title: string;
  photoUrl?: string;
  membersCount: number;
  isActive: boolean;
  ownerBotId: string;
  bot?: Bot;
}

// --- PUBLISHER ---
export interface InlineButton {
  text: string;
  url: string;
}

export interface PostContent {
  text?: string;
  media?: string | string[]; // URL or Array of URLs
  buttons?: InlineButton[][]; // Rows -> Columns
}

export interface SchedulePostPayload {
  publishAt: string; // ISO Date
  channelIds: string[];
  content: PostContent;
}

export interface ScheduleResponse {
  success: boolean;
  postId: string;
  scheduledCount: number;
  publishAt: string;
}
```

---

## 6. ⚠️ Error Handling

| Status Code | Meaning | Action |
| :--- | :--- | :--- |
| **200 / 201** | Success | Show success notification. |
| **400 Bad Request** | Validation Failed | Show `error.response.data.message` (e.g., "Invalid Token" or "Date in past"). |
| **401 Unauthorized** | Token Expired/Invalid | **Redirect to Login**. Clear localStorage. |
| **403 Forbidden** | Access Denied | User trying to access bot/channel they don't own. |
| **500 Server Error** | Backend Crash | Show "System Error, try again later". (Usually Redis or DB is down). |
