
# 📘 Impulse Frontend: Publisher & Scheduler Architecture

**Version:** 1.1 (Updated: Spoilers & Stars Support)
**Author:** Backend Team
**Module:** Publisher (Content Creation)

---

## 1. Концепция: "One Post, Many Destinations"
Система работает по принципу рассылки: один объект контента (`content`) -> массив каналов (`channelIds`).

---

## 2. ⚡️ КРИТИЧЕСКИЕ ФИЧИ (НЕ ПРОПУСТИТЬ!)

### А. Скрытый контент (Media Spoilers)
Для типов `POST` и `PAID_MEDIA` необходимо добавить тогл **"Has Spoiler"**.
*   **Логика:** Если включено, медиа-файл будет размыт до нажатия пользователем.
*   **Payload:** `content.options.has_spoiler: true`

### Б. Платные публикации (Telegram Stars)
Используется тип `PAID_MEDIA`. Позволяет продавать доступ к фото/видео.
*   **UI:** При выборе этого типа должен появляться Input для ввода цены.
*   **Payload:**
    ```json
    {
      "type": "paid_media",
      "content": {
        "text": "Exclusive content!",
        "media": ["https://..."],
        "paid_config": {
          "star_count": 50 // Цена в звездах (Integer)
        }
      }
    }
    ```

---

## 3. Типы Постов (Post Types)

Frontend должен реализовать Tabs/Switcher. От типа зависит валидация.

| Type | UI Особенности | Поля Payload |
| :--- | :--- | :--- |
| `post` | Текст + Медиа + Спойлер | `text`, `media`, `options.has_spoiler` |
| `paid_media` | **Цена в Stars** + Спойлер | `paid_config.star_count`, `media` |
| `poll` | Опрос/Викторина | `question`, `poll_options`, `poll_config` |

---

## 4. Структура Payload (Примеры)

### Стандартный пост со спойлером
```json
{
  "type": "post",
  "content": {
    "text": "Check this secret image!",
    "media": ["https://..."],
    "options": {
      "has_spoiler": true, 
      "show_caption_above_media": true
    }
  }
}
```

### Платный пост (Paid Media)
```json
{
  "type": "paid_media",
  "content": {
    "text": "Buy this for 10 stars",
    "media": ["https://..."],
    "paid_config": {
      "star_count": 10
    }
  }
}
```

---

## ✅ Чек-лист разработки формы
1.  [ ] **Spoiler Toggle:** Работает для обычных постов и платных медиа.
2.  [ ] **Stars Input:** Появляется только при `type: paid_media`.
3.  [ ] **Validation:** Блокировать отправку `paid_media`, если цена не указана или < 1.
