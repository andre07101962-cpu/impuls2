
# 🧩 Frontend Components Requirement

To implement `FRONTEND_INTEGRATION_SPEC.md`, create the following reusable components.

## 1. Atoms & Molecules
*   `ChannelAvatar`: Displays photoUrl or a gradient fallback with initials.
*   `StatusBadge`: Variants for 'Scheduled' (Blue), 'Published' (Green), 'Failed' (Red).
*   `TopicIcon`: Renders custom emoji or colored generic icon.
*   `PlatformIcon`: Icons for Post Types (Poll, Story, Audio, etc).

## 2. Forms (React Hook Form)
*   `PostTypeSwitcher`: Tabbed interface to switch `Post.type`.
*   **Sub-Forms:**
    *   `PollCreator`: Dynamic inputs for poll options.
    *   `LocationPicker`: Lat/Lng inputs.
    *   `PaidMediaConfig`: Stars input.
*   `PermissionToggles`: A list of switches for Chat Permissions (`can_send_messages`, etc.).
*   `DateTimePicker`: Integration with a library like `react-datepicker` or `dayjs`.

## 3. Complex Organisms
*   `PostComposer`: The main publishing interface.
    *   Left col: Type Switcher + Content Inputs.
    *   Right col: Preview (Mobile simulation) + Options + Scheduling.
*   `ChannelSelector`: Multi-select dropdown with Search.
    *   *Logic:* If a Forum Channel is selected, allow drilling down into `TopicSelector`.
*   `TopicTable`: Data grid for managing forum topics.

## 4. Modals
*   `LiveEditModal`: Simplified editor for published posts.
*   `BanUserModal`: Inputs for ID and Duration.
*   `PromoteAdminModal`: Permission checkboxes.
*   `InviteLinkModal`: Create/Edit links.
