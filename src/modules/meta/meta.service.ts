
import { Injectable } from '@nestjs/common';

@Injectable()
export class MetaService {
  /**
   * Returns standard Telegram Forum Topic Icon Colors.
   * These are fixed RGB integer values used by Telegram clients.
   */
  getTopicStickers() {
    return [
      { id: 'blue', color: 0x6FB9F0, name: 'Blue', emoji: '🔵' },
      { id: 'yellow', color: 0xFFD67E, name: 'Yellow', emoji: '🟡' },
      { id: 'violet', color: 0xCB86DB, name: 'Violet', emoji: '🟣' },
      { id: 'green', color: 0x8EEE98, name: 'Green', emoji: '🟢' },
      { id: 'rose', color: 0xFF93B2, name: 'Rose', emoji: '🌸' },
      { id: 'red', color: 0xFB6F5F, name: 'Red', emoji: '🔴' },
    ];
  }
}
