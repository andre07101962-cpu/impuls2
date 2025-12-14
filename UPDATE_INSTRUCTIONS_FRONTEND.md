# 🚀 Frontend Update Instructions (v3.2)

Backend has been updated to support the full range of Telegram features.

## 1. New Post Types

The `type` field in `POST /publisher/schedule` now accepts two new values: `poll` and `document`.

### A. Polls (Опросы)
**Requirements:**
- A question.
- Array of options (min 2, max 10).
- `poll_config` object for settings.

**Payload Example:**
```json
{
  "type": "poll",
  "publishAt": "...",
  "channelIds": ["..."],
  "content": {
     "question": "What feature should we add next?",
     "options": ["AI Writer", "Analytics", "CRM"],
     "poll_config": {
         "is_anonymous": true,
         "allows_multiple_answers": false,
         "type": "regular" // or 'quiz'
         // "correct_option_id": 0 // required if type is 'quiz'
     }
  }
}
```

### B. Documents (Files)
**Requirements:**
- `media` must be a URL to the file (PDF, ZIP, etc).
- `text` serves as the caption.

**Payload Example:**
```json
{
  "type": "document",
  "publishAt": "...",
  "channelIds": ["..."],
  "content": {
     "media": "https://myserver.com/price-list.pdf",
     "text": "Here is our updated price list for 2024."
  }
}
```

## 2. Pin Message Option
You can now pin any message (Post, Poll, Video) immediately after publishing.

**Where:** Inside `content.options`.

```json
{
  "content": {
     "text": "Important Announcement!",
     "options": {
         "pin": true, // <--- New Toggle
         "disable_notification": false
     }
  }
}
```

## 3. Delete / Cancel Post
New endpoint to delete posts.

*   **If Scheduled:** Cancels the timer (will not be posted).
*   **If Published:** Deletes the message from the Telegram Channel history.

**Request:**
`DELETE /publisher/{postId}`

**Response:**
```json
{
  "success": true,
  "details": {
    "cancelled": 1,         // Scheduled jobs removed
    "deletedFromTelegram": 0 // Published messages deleted
  }
}
```

## 4. UI Checklist
1.  Add "Poll" and "Document" to your Post Type selector.
2.  Add "Pin Message" toggle to the Settings/Options panel.
3.  Add "Delete" button (trash icon) to the Calendar/List view items.
