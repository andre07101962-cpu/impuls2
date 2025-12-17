
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../database/entities/user.entity';
import * as crypto from 'crypto';
import { Buffer } from 'buffer';

export interface TelegramUserDto {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  raw_data?: any;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 1. REGISTER / REFRESH
   * Saves ALL Telegram Data.
   */
  async registerOrRefreshToken(data: TelegramUserDto): Promise<string> {
    let user = await this.userRepository.findOne({ where: { telegramId: data.id } });

    if (!user) {
      user = this.userRepository.create({
        telegramId: data.id,
        role: UserRole.USER,
      });
    }

    // Update fields (Sync latest data from Telegram)
    user.firstName = data.first_name || user.firstName;
    user.lastName = data.last_name || user.lastName;
    user.username = data.username || user.username;
    user.languageCode = data.language_code || user.languageCode;
    user.isPremium = data.is_premium || false;
    user.rawData = data.raw_data; // Store full JSON
    // Note: photo_url logic usually requires `getUserProfilePhotos` API call, 
    // we store it if we have it, otherwise it's null.

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.accessTokenHash = this.hashToken(rawToken);
    
    await this.userRepository.save(user);

    return rawToken;
  }

  /**
   * 2. LOGIN (Returns User Info)
   */
  async login(telegramId: string, token: string) {
    const user = await this.verifyCredentials(telegramId, token);
    return {
        status: 'success',
        user: {
            id: user.id,
            telegramId: user.telegramId,
            username: user.username,
            firstName: user.firstName,
            role: user.role,
            avatar: user.photoUrl
        }
    };
  }

  /**
   * 3. VERIFY SESSION (For Guard)
   */
  async verifySession(token: string): Promise<User> {
    const hashedInput = this.hashToken(token);
    
    const user = await this.userRepository.createQueryBuilder('user')
      .addSelect('user.accessTokenHash')
      .where('user.accessTokenHash = :hash', { hash: hashedInput })
      .getOne();

    if (!user) return null;

    delete user.accessTokenHash;
    return user;
  }

  private async verifyCredentials(telegramId: string, token: string): Promise<User> {
    const user = await this.userRepository.createQueryBuilder('user')
      .addSelect('user.accessTokenHash')
      .where('user.telegramId = :telegramId', { telegramId })
      .getOne();

    if (!user || !user.accessTokenHash) {
      throw new UnauthorizedException('User not found or invalid credentials');
    }

    const hashedInput = this.hashToken(token);
    const hashBuffer = Buffer.from(user.accessTokenHash);
    const inputBuffer = Buffer.from(hashedInput);

    if (hashBuffer.length !== inputBuffer.length) {
        throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = crypto.timingSafeEqual(hashBuffer, inputBuffer);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
