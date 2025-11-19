import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { IsString, IsNotEmpty } from 'class-validator';

class LoginDto {
  @ApiProperty({ example: '123456789', description: 'Telegram ID (acts as Username)' })
  @IsString()
  @IsNotEmpty()
  telegramId: string;

  @ApiProperty({ example: 'abc123xyz...', description: 'Access Token received from Bot' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login to Dashboard' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.telegramId, dto.token);
  }
}