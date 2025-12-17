
# 📘 Frontend Integration Specification: "Impulse"
**Backend Status:** Fully Implemented (NestJS).
**Goal:** strict 1:1 implementation of all server capabilities on the client side.

---

## 1. 📢 MODULE: CHANNELS & SETTINGS
**Controller:** `ChannelsController`
**Base URL:** `/channels`

### 1.1. Channel Discovery & Verification
The user adds a bot, and we need to verify if the bot is an admin in a specific channel.

| Feature | Backend Endpoint | Frontend Logic (Store/Component) |
| :--- | :--- | :--- |
| **Verify Channel** | `POST /channels/verify` | **Component:** `AddChannelModal`<br>1. User inputs `@username`.<br>2. Call API.<br>3. If success: Show Channel Preview (Title, Members, Photo).<br>4. Button "Add to Dashboard" calls `POST /channels/add`. |
| **Preview** | `POST /channels/preview` | Used inside the modal to "Check" before adding. |
| **Sync Data** | `POST /channels/sync` | **Action:** `useChannelStore.sync(botId)`.<br>Triggered when user clicks "Force Refresh" icon on Dashboard header. |

### 1.2. Profile Management
Editing the channel's appearance.

| Feature | Backend Endpoint | Frontend Logic |
| :--- | :--- | :--- |
| **Edit Profile** | `PATCH /channels/profile` | **Tab:** `Settings / General`.<br>**Form:** `ChannelProfileForm`.<br>Inputs: `Title` (Text), `Description` (Textarea).<br>Action: Optimistic UI update -> API Call. |

### 1.3. Global Permissions (Group Settings)
Managing what regular members can do.

| Feature | Backend Endpoint | Frontend Logic |
| :--- | :--- | :--- |
| **Set Permissions** | `POST /channels/permissions` | **Tab:** `Settings / Permissions`.<br>**Component:** `PermissionToggles`.<br>**State:** Object `{ can_send_messages: boolean, can_send_media: boolean, ... }`.<br>**Note:** These are *default* permissions for the group. |

### 1.4. Forum Topics Management
Only visible if `channel.isForum === true`.

| Feature | Backend Endpoint | Frontend Logic |
| :--- | :--- | :--- |
| **List Topics** | `GET /channels/:id/topics` | **Tab:** `Forum`.<br>**Component:** `TopicTable`.<br>Columns: Icon, Name, Status (Open/Closed), Actions. |
| **Create Topic** | `POST /channels/topic` | **Modal:** `CreateTopicModal`.<br>Inputs: `Name` (Required), `IconColor` (ColorPicker), `IconEmoji` (EmojiPicker). |
| **Edit Topic** | `PATCH .../topic/:id` | **Modal:** `EditTopicModal`.<br>Allow changing Name or Icon. |
| **Close/Reopen** | `POST .../topic/:id/(close/reopen)` | **Action:** Button in Table Row. Changes badge status immediately. |
| **Delete** | `DELETE .../topic/:id` | **Action:** "Delete" in Context Menu. **Warning Modal:** "This will delete all messages in the topic!". |

### 1.5. Moderation (Admins & Bans)
Managing the people.

| Feature | Backend Endpoint | Frontend Logic |
| :--- | :--- | :--- |
| **List Admins** | `GET .../admins` | **Tab:** `People / Admins`.<br>**Component:** `AdminList`.<br>Fetch live from Telegram (don't cache too long). |
| **Ban User** | `POST /channels/ban` | **Tab:** `People / Banned`.<br>**Modal:** `BanUserModal`.<br>Inputs: `UserID` (Number), `Until Date` (DatePicker - Optional, empty = forever). |
| **Unban User** | `POST /channels/unban` | **Action:** Button "Unban" in the Banned list. |
| **Promote Admin** | `POST /channels/promote` | **Modal:** `PromoteAdminModal`.<br>Inputs: `UserID`, `Custom Title` (String).<br>**Permissions:** List of toggles (`can_delete_messages`, `can_invite_users`, etc.). |
| **Restrict (Mute)**| `POST .../restrict` | **Modal:** `RestrictUserModal`.<br>Similar to Ban, but with granular permissions (e.g., "Read Only"). |
| **Leave Channel** | `POST .../leave` | **Tab:** `Settings / Danger Zone`.<br>**UI:** Red Button. Confirms "Are you sure? Bot will leave.". |

### 1.6. Growth (Invites)

| Feature | Backend Endpoint | Frontend Logic |
| :--- | :--- | :--- |
| **Create Link** | `POST .../invite-link` | **Tab:** `Growth`.<br>**Modal:** `CreateLinkModal`.<br>Inputs: `Name` (Internal), `ExpireDate`, `MemberLimit`. |

---

## 2. ✍️ MODULE: PUBLISHER (CREATOR STUDIO)
**Controller:** `PublisherController`
**Base URL:** `/publisher`

### 2.1. The "Universal Composer"
A complex form that changes fields based on `PostType`.

**State Manager:** `usePostComposerStore`
**Fields:** `type`, `channels[]`, `publishAt`, `deleteAt`, `contentPayload`.

#### 🅰️ Supported Post Types (Switcher)
The frontend MUST implement a specialized sub-form for each type supported by the backend:

1.  **POST (Default):**
    *   `TextArea` (Support HTML tags: `<b>`, `<i>`, `<a href>`).
    *   `MediaUploader` (Array of URLs). If >1 -> Album.
2.  **STORY:**
    *   `MediaUploader` (Single File, Video/Photo).
    *   `Period` (Select: 6h, 12h, 24h, 48h).
3.  **POLL:**
    *   `Input`: Question.
    *   `DynamicList`: Options (Min 2, Max 10).
    *   `Toggles`: Anonymous, Multiple Answers, Quiz Mode (Select correct answer).
4.  **PAID_MEDIA:**
    *   `MediaUploader` (Photo/Video).
    *   `Input`: Price in Stars (`star_count`).
5.  **AUDIO:**
    *   `FileUploader` (Audio).
    *   `Input`: Performer, Title.
    *   `CoverArt`: Image Uploader.
6.  **VOICE:**
    *   `FileUploader` (.ogg).
7.  **VIDEO_NOTE (Circle):**
    *   `FileUploader` (Square Video).
8.  **LOCATION:**
    *   `Inputs`: Latitude, Longitude. (Optional: Map picker).
9.  **CONTACT:**
    *   `Inputs`: Phone, First Name, Last Name.
10. **STICKER:**
    *   `Input`: File ID or URL.
11. **COPY / FORWARD:**
    *   `Inputs`: `From Chat ID`, `Message ID`.
    *   *Use Case:* Stealing content or reposting.

### 2.2. Options & Settings (Sidebar)
Every post type shares these common settings:
*   [ ] **Pin Message** (`options.pin`)
*   [ ] **Silent** (`options.disable_notification`)
*   [ ] **Protect Content** (No Forwarding) (`options.protect_content`)
*   [ ] **Topic Selection:** If specific channel selected, show `TopicSelector` dropdown.

### 2.3. Scheduling & Timers
*   **Publish Date:** `DateTimePicker`. Default: Now.
*   **Auto-Delete:** `DateTimePicker`. Default: Empty. Logic: `Delete > Publish`.

### 2.4. Edit Mode (The "Live" Switch)
When editing a post from the Calendar/List:

1.  **If Status == 'SCHEDULED':**
    *   Open full `PostComposer`.
    *   User can change Type, Media, Time, Channels.
    *   **API:** `PATCH /publisher/schedule/:id` (Regular payload).

2.  **If Status == 'PUBLISHED':**
    *   Open `LiveEditModal`.
    *   **Restricted UI:** Can ONLY change `Text/Caption` and `InlineButtons`.
    *   **Hidden:** Media uploader (mostly), Channel selector.
    *   **API:** `PATCH /publisher/schedule/:id` with `isLiveEdit: true`.

### 2.5. Deletion
*   **If Scheduled:** "Cancel Publication".
*   **If Published:** "Delete from Telegram".
*   **API:** `DELETE /publisher/:id`.

---

## 3. 🎨 VISUAL STATES

### Loading & Optimistic UI
*   The backend interacts with Telegram API which can be slow (1-3s).
*   **Requirement:** All buttons must have `isSubmitting` state (Spinner).
*   **Toasts:** Show "Request sent to Telegram..." immediately, then "Success" or "Error".

### Error Handling
*   Handle `429 Flood Wait`. If backend returns "Retry after X", Frontend should show a countdown timer or a specific warning toast: "Telegram is limiting actions. Please wait X seconds."
*   Handle `403 Bot Kicked`. If request fails because bot is kicked, redirect user to dashboard and show "Bot lost access".
