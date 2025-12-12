
# 📘 Impulse API — Ultimate Frontend Developer Guide

**Version:** 3.1 (Stories, Paid Media & Admin Tools)
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

---

## 2. 🤖 Bots Module (BYOB)

### List User Bots
`GET /bots`

### Connect New Bot
`POST /bots`
```json
{
  "token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
}
```

---

## 3. 📢 Channels & Admin Tools

**⚠️ Discovery:** Channels appear automatically when the user adds their bot as an Admin.

### List Channels
`GET /channels`

### 🆕 Verify Channel Health (Sync)
Forces a check of Admin permissions, updates subscriber count and avatar.
`POST /channels/verify`
```json
{
  "botId": "uuid-of-bot",
  "channelId": "-100123456789"
}
```

### 🆕 Create Invite Link (Ad Tracking)
Create unique links to track where subscribers come from.
`POST /channels/invite-link`
```json
{
  "botId": "uuid-of-bot",
  "channelId": "-100123456789",
  "name": "Instagram Ad Campaign #1"
}
```
**Response:** returns the invite link object (url, name, etc).

### 🆕 Update Channel Profile
Change the title or description remotely.
`PATCH /channels/profile`
```json
{
  "botId": "uuid-of-bot",
  "channelId": "-100123456789",
  "title": "Impulse News 🚀",
  "description": "The best news about tech."
}
```

---

## 4. 🚀 Publisher (Posts, Stories, Stars)

**Endpoint:** `POST /publisher/schedule`

### Base Payload Structure
```typescript
{
  publishAt: string;        // ISO 8601 Date
  channelIds: string[];     // ["-100..."]
  type: 'post' | 'story' | 'paid_media'; // Defaults to 'post'
  content: {
     text?: string;
     media?: string | string[];
     buttons?: InlineButton[][];
     // New Options
     options?: {
        disable_notification?: boolean; // Silent message
        protect_content?: boolean;      // Disable forwarding/saving (DRM)
        has_spoiler?: boolean;          // Blur media/text
     },
     // New Configs
     paid_config?: { star_count: number };
     story_config?: { period: number };
  }
}
```

### Scenario A: Standard Post (Text + Image + Buttons)
```json
{
  "type": "post",
  "publishAt": "2025-12-25T10:00:00.000Z",
  "channelIds": ["-1001234567890"],
  "content": {
    "text": "<b>Hello!</b>",
    "media": "https://example.com/image.jpg",
    "options": {
        "disable_notification": true
    },
    "buttons": [
      [ { "text": "Open Link", "url": "https://google.com" } ]
    ]
  }
}
```

### Scenario B: Telegram Story 📸
Stories require a photo or video. They sit at the top of the channel circle.
```json
{
  "type": "story",
  "publishAt": "2025-12-25T12:00:00.000Z",
  "channelIds": ["-1001234567890"],
  "content": {
    "media": "https://example.com/story-video.mp4",
    "text": "Check out our new drop! 👇", // Caption on story
    "story_config": {
        "period": 86400 // How long it lasts in seconds (86400 = 24h)
    }
  }
}
```

### Scenario C: Paid Media (Stars) ⭐️
Content hidden behind a paywall. User pays X Stars to view.
```json
{
  "type": "paid_media",
  "publishAt": "2025-12-25T14:00:00.000Z",
  "channelIds": ["-1001234567890"],
  "content": {
    "text": "Exclusive backstage footage! Unlock to watch.",
    "media": ["https://example.com/exclusive.mp4"],
    "paid_config": {
        "star_count": 50 // Cost in Telegram Stars
    }
  }
}
```

### Scenario D: Protected Content (DRM)
Prevents users from forwarding the message or saving the image.
```json
{
  "type": "post",
  "publishAt": "2025-12-25T15:00:00.000Z",
  "channelIds": ["-1001234567890"],
  "content": {
    "text": "Secret leak!",
    "media": "https://example.com/secret.jpg",
    "options": {
        "protect_content": true
    }
  }
}
```

---

## 5. 🛠 Full Capabilities: What can the Bot do?
Use this section to build your UI toggles/switches.

### A. Content Publishing
| Feature | Description | API Field |
| :--- | :--- | :--- |
| **Silent Post** | Sends message without sound notification. | `options.disable_notification` |
| **Protect Content** | Disables forwarding and saving (DRM). | `options.protect_content` |
| **Spoiler** | Blurs image/video until clicked. | `options.has_spoiler` |
| **Stories** | Post temporary stories (Images/Videos). | `type: 'story'` |
| **Paid Media** | Paywall content (Images/Videos) for Stars. | `type: 'paid_media'` |
| **Albums** | Up to 10 photos/videos in one message. | `media: string[]` |

### B. Channel Administration
| Feature | Description | API Endpoint |
| :--- | :--- | :--- |
| **Sync Info** | Auto-update Title, Description, Member Count, Photo. | `POST /channels/verify` |
| **Edit Profile** | Change Title & Description remotely. | `PATCH /channels/profile` |
| **Invite Links** | Generate unique links to track ad sources. | `POST /channels/invite-link` |

### C. Automation
| Feature | Description |
| :--- | :--- |
| **Scheduling** | Server-side queue (Redis). Supports timezone handling. |
| **Auto-Discovery** | When a user adds the bot as Admin, the channel appears in Impulse automatically via Webhook events. |
