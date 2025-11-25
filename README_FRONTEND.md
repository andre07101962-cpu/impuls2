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

### Auto-Sync (Event Driven)
We do not have a manual "Add Channel" button anymore.
**How it works:**
1. User adds their bot as Administrator to a Telegram Channel.
2. Telegram sends a webhook to our server.
3. Our server automatically adds the channel to the "My Channels" list.
4. Frontend should poll `GET /channels` or offer a "Refresh" button.

### Get My Channels
**GET** `/channels`
Headers: `Authorization: Bearer ...`
