# 📘 Impulse Frontend: Channels, Groups & Forums Architecture

**Version:** 2.0 (Full Telegram API Compliance)
**Author:** Backend Team
**Context:** Telegram Management System

---

## 1. Философия: "Total Control"

Мы предоставляем пользователю **полный спектр** управления каналом, доступный через Bot API.
Интерфейс управления каналом должен быть разделен на смысловые блоки (Tabs):
1.  **Overview** (Статистика, Превью).
2.  **Content** (Лента, Календарь).
3.  **Forum** (Если `isForum: true` - управление топиками).
4.  **Settings** (Фото, Описание, Права, Ссылки).
5.  **People** (Администраторы, Бан-лист, Заявки).

---

## 2. Сущность: Channel (Расширенная)

```typescript
interface Channel {
  id: string;               
  title: string;            
  username?: string;        
  description?: string;     
  photoUrl?: string | null; 
  membersCount: number;     
  type: 'channel' | 'supergroup' | 'group' | 'private';
  isForum: boolean;         
  linkedChatId?: string;    
  isActive: boolean;
  
  // 🆕 Новые поля прав (Permissions)
  permissions?: ChatPermissions; 
}

interface ChatPermissions {
  can_send_messages?: boolean;
  can_send_media_messages?: boolean;
  can_send_polls?: boolean;
  can_send_other_messages?: boolean;
  can_add_web_page_previews?: boolean;
  can_change_info?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  can_manage_topics?: boolean;
}
```

---

## 3. Управление Форумами и Темами (Topics)

### 3.1. General Topic (ID: 1)
*   **Особенность:** Telegram позволяет переименовать "General" ветку.
*   **Метод:** `PATCH /channels/:id/topics/general`
*   **Payload:** `{ name: "Главная флудилка" }`

### 3.2. Стандартные действия
| Действие | Метод | Endpoint | Payload |
| :--- | :--- | :--- | :--- |
| Список | `GET` | `/channels/:id/topics` | - |
| Создать | `POST` | `/channels/topic` | `{ name, iconColor, iconEmojiId }` |
| Изменить | `PATCH` | `/channels/topic/:id` | `{ name, iconEmojiId }` |
| Закрыть | `POST` | `/channels/topic/:id/close` | - |
| Открыть | `POST` | `/channels/topic/:id/reopen` | - |
| Удалить | `DELETE` | `/channels/topic/:id` | ⚠️ Удаляет ветку с сообщениями! |
| **Unpin All** | `POST` | `/channels/topic/:id/unpin-all` | Снять все закрепы в ветке. |

### 3.3. Иконки
Используйте хелпер `getTopicColor(int)` для цветов. Для стикеров используйте стандартный набор Telegram (API `getForumTopicIconStickers` закешировано на бэке, фронт может использовать хардкод ID популярных стикеров или запрашивать `/meta/topic-stickers`).

---

## 4. Настройки Чата (Settings Tab)

### 4.1. Основная информация
*   **Изменить Аватар:** `PUT /channels/:id/photo` (FormData: `file`).
*   **Удалить Аватар:** `DELETE /channels/:id/photo`.
*   **Название/Описание:** `PATCH /channels/profile`.

### 4.2. Глобальные права (Permissions)
Только для Групп/Супергрупп. Для Каналов это не актуально (там писать могут только админы).
*   **Endpoint:** `PATCH /channels/:id/permissions`
*   **UI:** Список переключателей (Toggles).
    *   [x] Send Messages
    *   [x] Send Media
    *   [x] Add Members
    *   [ ] Pin Messages

### 4.3. Меню Бота
*   **Endpoint:** `POST /channels/:id/menu-button`
*   **Payload:** `{ text: "Open App", url: "..." }`
*   Позволяет настроить синюю кнопку "Menu" слева от поля ввода.

---

## 5. Люди и Модерация (People Tab)

### 5.1. Администраторы
*   **Список:** `GET /channels/:id/admins`
*   **Действие: Promote (Назначить):**
    *   `POST /channels/:id/admins`
    *   **Payload:** `{ userId: number, customTitle: "Boss", permissions: {...} }`
    *   ⚠️ Бот может назначать админов, только если он сам создан создателем чата, либо если ему явно дали это право.
*   **Действие: Demote (Снять):** Отправить permissions с одними `false`.

### 5.2. Бан-лист и Ограничения
*   **Kick/Ban:** `POST /channels/:id/ban`
    *   Payload: `{ userId: number, untilDate?: string }`
*   **Unban:** `POST /channels/:id/unban`
*   **Restrict (Read-Only):** `POST /channels/:id/restrict`
    *   Payload: `{ userId: number, permissions: { can_send_messages: false ... }, untilDate: string }`

### 5.3. Заявки на вступление (Join Requests)
Если у канала стоит "Approve new members".
*   **Список:** `GET /channels/:id/join-requests`
*   **Принять:** `POST /channels/:id/join-requests/approve` ({ userId })
*   **Отклонить:** `POST /channels/:id/join-requests/decline` ({ userId })

---

## 6. Пригласительные Ссылки (Growth Tab)

Управление маркетинговыми ссылками.

| Действие | Метод | Endpoint | Payload |
| :--- | :--- | :--- | :--- |
| **Список** | `GET` | `/channels/:id/invites` | Получить все созданные ботом ссылки. |
| **Создать** | `POST` | `/channels/invite-link` | `{ name: "Instagram Bio", expireDate?, memberLimit?, createsJoinRequest: boolean }` |
| **Изменить** | `PATCH` | `/channels/invite/:link` | Изменить параметры. |
| **Отозвать** | `DELETE` | `/channels/invite/:link` | Ссылка перестанет работать (`revoke`). |

---

## 7. Опасная зона

### Выход из канала
*   **Endpoint:** `POST /channels/:id/leave`
*   **UI:** Красная кнопка "Leave Channel".
*   ⚠️ Бот выйдет из чата. Для возврата его придется добавлять вручную.
