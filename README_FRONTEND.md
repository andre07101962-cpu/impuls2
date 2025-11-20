# Impulse API - Frontend Integration Guide

## 🔐 Authentication Flow
Our system uses a **2-Factor-like** authentication where Telegram acts as the identity provider.

### 1. User Registration / Credential Retrieval
1. User opens our bot in Telegram: `@ice_deep_dive_bot`.
2. User sends `/start`.
3. Bot replies with:
   - **Login ID** (Their Telegram ID)
   - **Access Token** (Their secure password)

### 2. Login (POST /auth/login)
The frontend must allow the user to input these credentials.

**Request:**
```json
POST https://impyls.onrender.com/auth/login
{
  "telegramId": "123456789",
  "token": "566b956c..." // The long string from the bot
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "user": {
    "id": "d73c6227-...", // UUID in our database
    "telegramId": "123456789",
    "role": "user"
  }
}
```
*Note: The server does NOT return a JWT. The `token` provided by the user IS the session key.*

### 3. Authenticated Requests
Save the `token` in `localStorage`. Use it in the `Authorization` header for ALL subsequent requests.

**Header:**
```
Authorization: Bearer <TOKEN_FROM_BOT>
```

---

## 🤖 Module: User Bots (BYOB)

### Get My Bots
**GET** `/bots`
Headers: `Authorization: Bearer ...`

### Connect New Bot
**POST** `/bots`
Headers: `Authorization: Bearer ...`
Body:
```json
{
  "token": "123456:ABC-DEF..." // Token from BotFather
}
```

---

## 📢 Module: Channels

### Sync Channels (Recommended)
Automatically finds channels where the bot is an admin.

**POST** `/channels/sync`
Headers: `Authorization: Bearer ...`
Body:
```json
{
  "botId": "uuid-of-the-bot"
}
```
