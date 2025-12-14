# 🏗 Impulse Architecture: Frontend Implementation Guide

**To:** Frontend Developer / AI Agent
**From:** Backend Architect
**Context:** This document explains the **Data Flow** and **Entity Relationships** required to implement the v3.2 Publishing System (Polls, Docs, Pinning, Deletion).

---

## 1. 🌍 The Big Picture (How it works)

We are building a **"Remote Control" for Telegram Channels**. The Frontend does not talk to Telegram directly. It talks to our **NestJS Backend**, which acts as a scheduler and router.

### The Data Lifecycle
1.  **Composition (React):** User creates a complex JSON object (The "Payload") in the UI.
2.  **Scheduling (NestJS):** You send this Payload to `POST /publisher/schedule`. The backend validates it and calculates the delay (e.g., "Post in 3 hours").
3.  **Queue (Redis/BullMQ):** The backend saves the job in a Redis Queue.
4.  **Execution (Worker):** When the time comes, the Backend wakes up, reads the Payload, decrypts the Bot Token, and calls the Telegram API.

### ⚠️ Critical Responsibility
**The Frontend is the primary validator.**
If you send "garbage" JSON (e.g., a Poll without a question), the Backend might accept it, but the **Job will fail silently** 3 hours later when it tries to execute.
*Therefore, your client-side validation logic is the most important safety net.*

---

## 2. 🧩 Entity Relationships

Understanding these links prevents logic errors:

1.  **User ↔ Bot:** A User owns many Bots.
2.  **Bot ↔ Channel:** A Bot is an Admin of many Channels.
    *   *Constraint:* You cannot post to a Channel if the Bot is dead/kicked.
3.  **Post ↔ Content:** A Post is just a container. The real magic is in the `content` JSON column.

---

## 3. 💣 The "Poll Options" Conflict (Crucial)

We have a naming collision in our JSON structure that you **must** handle carefully.

*   **The Problem:** We use a field named `options` for global settings (Pin, Silent, DRM). However, Telegram Polls also have "options" (the choices: Yes/No).
*   **The Fix:**
    *   Use `content.options` for **Settings** (Pinning, Silent).
    *   Use `content.poll_options` for **Poll Choices** (The array of answers).

**❌ WRONG (Will break):**
```json
{
  "type": "poll",
  "content": {
     "question": "Yes or No?",
     "options": ["Yes", "No"], // <--- CONFLICT! This overwrites global settings!
     "options": { "pin": true } // <--- This overwrites the choices!
  }
}
```

**✅ CORRECT:**
```json
{
  "type": "poll",
  "content": {
     "question": "Yes or No?",
     "poll_options": ["Yes", "No"], // <--- Safe unique name
     "options": { "pin": true }     // <--- Safe global settings
  }
}
```

---

## 4. 📝 Sequential Implementation Plan

Please execute the implementation in this exact order to maintain system integrity.

### Step 1: The Contract (Types)
*Goal: update `types.ts` first so TypeScript helps you.*
1.  Update `PostType` Enum (Add `POLL`, `DOCUMENT`).
2.  Define interfaces for `PollConfig`, `StoryConfig`, `PaidConfig`.
3.  Update the `PostContent` interface to include `poll_options` (string array).

### Step 2: The Brain (State Management)
*Goal: Update the form logic before the UI.*
1.  In `Publisher.tsx`, update the `initialState`.
2.  Create a switch/case logic for `validatePayload()`:
    *   If `POLL`: Check `poll_options.length` (2-10).
    *   If `DOCUMENT`: Check `media` is a single string.
3.  Update `constructPayload()` function to map your state variables to the **Correct JSON Structure** defined in Section 3.

### Step 3: The Body (UI Components)
*Goal: Visual elements.*
1.  **Media Gallery:** Update to handle "File Mode" (show file icon instead of image preview).
2.  **Poll Builder:** Create a dynamic list component (Add Option / Remove Option inputs).
3.  **Settings Panel:** Add the "Pin Message" toggle switch.

### Step 4: The Nervous System (API Integration)
*Goal: Wire up the buttons.*
1.  **Delete Action:**
    *   Add a trash icon to the Calendar items.
    *   On click -> `DELETE /publisher/:id`.
    *   Handle 200 OK (Show toast "Post cancelled/deleted").
2.  **Create Action:**
    *   Ensure `type` is sent at the top level of the JSON body.

---

## 5. 🔍 Final Review (Self-Correction)

Before finishing, ask yourself:
1.  *"Did I put the poll answers in `poll_options` or `options`?"* (Should be `poll_options`).
2.  *"Does the Document post send an Array or a String for media?"* (Backend handles both, but String is preferred for single files).
3.  *"Did I prevent the user from Pinning a Story?"* (Stories cannot be pinned via the API options, hide the toggle if type == Story).

**Good luck. Use `CHECKLIST_FRONTEND.md` for the line-by-line verification.**
