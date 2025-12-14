
# 🛡️ IMPULSE: MASTER FRONTEND PROTOCOL (v3.3)
**Doc Version:** 3.3.0 (Synced with Backend Hotfixes)
**Target:** Frontend Developer
**Objective:** Complete verification of the Post Creation, Editing, Scheduling, and Deletion flow.

---

## 🚨 SECTION 0: CRITICAL INTEGRATION QUIZ (MUST PASS)
*Backend Architect requests confirmation on these specific logic points to avoid 400/500 errors.*

1.  **[ ] The Channel Trap:** 
    *   **Question:** When opening the **Edit Modal** (for both Scheduled and Published posts), is the Channel Selector component **DISABLED/READ-ONLY**?
    *   **Reason:** The Backend `PATCH /schedule/:id` currently ignores changes to `channelIds`. If a user unchecks a channel in UI, it won't be removed on the server, leading to data desync.
    
2.  **[ ] The Auth Type Safety:**
    *   **Question:** When calling `POST /auth/login`, are you converting `telegramId` to a **String**? (e.g. `String(window.Telegram.WebApp.initDataUnsafe.user.id)`)?
    *   **Reason:** The Backend now strictly validates `@IsNumberString()`. Sending a raw number or "undefined" will cause a 400 error.

3.  **[ ] Live Edit Timer:**
    *   **Question:** If `status === 'published'`, allows the user to change the **Auto-Delete Timer**?
    *   **Reason:** Backend now supports updating `deleteAt` even for published posts. Ensure this input is NOT disabled in Live Edit mode (unlike Media/Text).

4.  **[ ] The Poll Text Cleanup:**
    *   **Question:** When submitting a POLL, do you explicitly set `content.text` to `undefined` or `null`?
    *   **Reason:** Telegram API will reject a Poll that tries to send a caption/text attached to it.

5.  **[ ] Story Button Block:**
    *   **Question:** If `type === 'story'`, are the **"Add Button"** and **"Pin"** UI elements hidden?
    *   **Reason:** Stories do not support inline buttons or pinning. Sending them might fail validation or be silently ignored.

---

## 🛑 SECTION 1: DATA STRUCTURES (TYPESCRIPT)
*Define these interfaces exactly as shown to match Backend Entities.*

### 1.1 Post Types Enum
- [x] **Enum defined:**
  ```typescript
  export enum PostType {
    POST = 'post',             // Text, Photo, Video, Album
    STORY = 'story',           // Telegram Story (Mobile only view)
    PAID_MEDIA = 'paid_media', // Telegram Stars (Blurry content)
    POLL = 'poll',             // Quiz or Regular Poll
    DOCUMENT = 'document',     // File (PDF, ZIP, etc)
  }
  ```

### 1.2 The "Payload" Interface
- [x] **Interface matches JSONB structure:**
  ```typescript
  interface PostContentPayload {
    text?: string;                // Used for Post text, Caption for Media/Docs
    media?: string | string[];    // Array for Albums, Single string for Story/Doc
    buttons?: InlineButton[][];   // Only for 'post' type!
    
    // --- POLLS (Specific) ---
    question?: string;
    poll_options?: string[];      // ⚠️ MUST BE 'poll_options', NOT 'options'
    poll_config?: {
       is_anonymous: boolean;
       allows_multiple_answers: boolean;
       type: 'regular' | 'quiz';
       correct_option_id?: number; // Required if type is 'quiz'
    };

    // --- GLOBAL SETTINGS (Applied to all) ---
    options?: {
       disable_notification?: boolean; // Silent Mode
       protect_content?: boolean;      // DRM (No Save/Forward)
       has_spoiler?: boolean;          // Spoiler animation
       pin?: boolean;                  // 🆕 Pin to channel top
    };

    // --- OTHER CONFIGS ---
    story_config?: { period: number };    // e.g. 86400
    paid_config?: { star_count: number }; // e.g. 50
  }
  ```

---

## 🛠️ SECTION 2: THE CONSTRUCTOR (UI FLOW)
*Walkthrough of the "Create Post" Modal/Page.*

### 2.1 Channel Selection
- [x] **Validation:** Button "Schedule" is disabled if `channelIds` array is empty.
- [x] **Inactive Channels:** If a channel has `isActive: false` (bot kicked), it must be visually disabled or show a warning icon in the selector.
- [x] **Edit Mode:** Selector MUST BE DISABLED when editing an existing post.

### 2.2 Post Type Logic (Conditional Rendering)

#### A. Type: STANDARD POST (`post`)
- [x] **Media:** Accepts 0 to 10 items (Photos/Videos).
- [x] **Album Logic:** If >1 media items -> Send as Array.
- [x] **Buttons:** Allowed. (Interface for adding URL buttons).
- [x] **Constraints:** If `media` is empty AND `text` is empty -> Block submit.

#### B. Type: STORY (`story`)
- [x] **Media:** Accepts EXACTLY 1 item (Photo or Video).
- [x] **Buttons:** HIDDEN (Stories do not support inline buttons via API).
- [x] **Config:** Hidden field `story_config.period` defaults to `86400` (24h).

#### C. Type: DOCUMENT (`document`) 🆕
- [x] **Input:** Shows file upload or URL input instead of Image Gallery.
- [x] **Preview:** Shows standard file icon (e.g., 📄 PDF), does NOT try to render it as an image.
- [x] **Payload:** `content.media` sends a **String** (URL), not an array.
- [x] **Caption:** The main text area acts as the file caption.

#### D. Type: POLL (`poll`) 🆕
- [x] **UI:** Hides Media Uploader. Hides Text Area. Shows "Poll Builder".
- [x] **Builder:** Inputs for "Question" and dynamic list for "Answers".
- [x] **Limits:** Min 2 answers, Max 10 answers.
- [x] **Quiz Mode:** If user selects "Quiz Mode", UI asks to select which answer is correct (Radio button).
- [x] **Payload Check:** Ensure answers are sent in `poll_options` array.

#### E. Type: PAID MEDIA (`paid_media`)
- [x] **Input:** Adds a numeric input for "Star Price" (1-2500).
- [x] **Validation:** `star_count` must be > 0.
- [x] **Media:** Required (Photo/Video).

---

## ⚙️ SECTION 3: GLOBAL SETTINGS PANEL
*These toggles apply to almost all post types.*

### 3.1 Pinning (New)
- [x] **UI:** Toggle switch "Pin to Channel".
- [x] **Logic:** Sends `content.options.pin = true`.
- [x] **Context:** Works for Posts, Polls, Videos. (Does NOT work for Stories, hide toggle if type=story).

### 3.2 Notification & Privacy
- [x] **Silent:** Toggle "Send without sound" -> `content.options.disable_notification`.
- [x] **Protect:** Toggle "Prevent Saving/Forwarding" -> `content.options.protect_content`.

---

## 📅 SECTION 4: SCHEDULING (TIME)

### 4.1 Date Format
- [x] **Payload:** `publishAt` must be a full ISO String with Timezone (e.g., `2023-10-25T14:30:00.000Z`).
- [x] **Timezone UX:** Ensure the user understands if they are picking time in their Local Time or UTC. (Recommendation: Convert Local Picker -> UTC for Payload).

---

## 📡 SECTION 5: API INTERACTIONS (REQUESTS)

### 5.1 Create (POST /publisher/schedule)
- [x] **Body Structure:**
  ```json
  {
    "type": "poll",  <-- IMPORTANT: Top level field
    "channelIds": ["..."],
    "publishAt": "...",
    "content": { ... }
  }
  ```
- [x] **Response Handling:** On 200 OK -> Close modal, Clear form, Toast "Scheduled".

### 5.2 Edit (PATCH /publisher/schedule/:id)
- [x] **Lock Logic:** If `status` is 'published' or 'failed', the "Edit" button in UI is hidden or disabled. Only 'scheduled' posts can be edited.
- [x] **Payload:** Only send fields that changed (or full object).
- [x] **Type Switching:** User CAN change type (e.g., Convert Text Post -> Poll) during edit.

### 5.3 Delete (DELETE /publisher/:id)
- [x] **Confirmation:** Modal "Are you sure?".
    - If `status` == 'scheduled': Text "This will cancel the publication."
    - If `status` == 'published': Text "This will DELETE the message from the Telegram Channel."
- [x] **Endpoint:** Calls `DELETE /publisher/:id`.
- [x] **Response:** Backend returns `{ success: true, details: { cancelled: 1, ... } }`. Update UI to remove item from list.

---

## 🧪 SECTION 6: DEVELOPER CONFIRMATION
*Frontend Developer: Please fill this out and return.*

| Feature | Status | Developer Notes (If any) |
| :--- | :--- | :--- |
| **Enum Sync** | [x] | Updated types.ts |
| **Poll `poll_options` Fix** | [x] | pollOptionsList maps to poll_options. NO CONFLICT. |
| **Document Type UI** | [x] | Sends string instead of array for media. |
| **Story Type UI** | [x] | Validates media presence. Configs wired. |
| **Pin Toggle** | [x] | Added to Global Settings block. |
| **Delete Action** | [x] | Connected to DELETE /publisher/:id. |
| **Date ISO Conversion** | [x] | Using standard JS Date ISO conversion. |
| **Empty Validation** | [x] | Guard clauses added. |
| **Channel Lock (Edit)** | [ ] | **PENDING VERIFICATION** |
| **Live Timer Edit** | [ ] | **PENDING VERIFICATION** |

---
**Signed off by:** Senior Backend Architect
**Date:** 2024-12-14
