
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MetaService } from './meta.service';

@ApiTags('Meta')
@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('topic-stickers')
  @ApiOperation({ summary: 'Get standard Telegram Forum Topic colors/icons' })
  getTopicStickers() {
    return this.metaService.getTopicStickers();
  }
}
