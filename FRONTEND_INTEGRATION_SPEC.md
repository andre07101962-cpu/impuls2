
# 📘 Frontend Integration Specification: "Impulse"
**Backend Status:** Fully Implemented (NestJS).
**Goal:** strict 1:1 implementation of all server capabilities.

---

## 1. 📢 MODULE: CHANNELS & SETTINGS
*(Sections 1.1 - 1.6 remain unchanged)*

---

## 2. ✍️ MODULE: PUBLISHER (CREATOR STUDIO)

### 2.1. The "Universal Composer"
A complex form that changes fields based on `PostType`.

#### 🅰️ Обязательные элементы управления (Specific Controls)

1.  **Spoiler Control (Toggle):**
    *   Должен присутствовать в секции "Media Options".
    *   Мапится в `content.options.has_spoiler`.
    *   **Важно:** Telegram поддерживает спойлеры для Фото и Видео.

2.  **Monetization Control (Input):**
    *   Появляется только если `Post.type === 'paid_media'`.
    *   Метка: "Price in Stars (⭐)".
    *   Мапится в `content.paid_config.star_count`.

3.  **Caption Position (Toggle):**
    *   Опция: "Show caption above media".
    *   Мапится в `content.options.show_caption_above_media`.

### 2.2. Options & Settings (Sidebar)
Common settings for almost all posts:
*   [ ] **Pin Message** (`options.pin`)
*   [ ] **Silent** (`options.disable_notification`)
*   [ ] **Protect Content** (`options.protect_content`)
*   [ ] **Has Spoiler** (`options.has_spoiler`) <--- 🆕
*   [ ] **Message Effect** (`options.message_effect_id`) <--- 🆕 (Premium effects)

---

## 3. 🎨 VISUAL STATES & PREVIEW
*   **Spoiler Preview:** В превью поста на фронтенде желательно отображать размытие (blur) поверх картинки, если включен тогл "Has Spoiler".
*   **Paid Media Preview:** Добавить иконку "Звезды" поверх медиа в превью.
