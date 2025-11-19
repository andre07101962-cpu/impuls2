import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../database/entities/user.entity';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 1. REGISTER / REFRESH
   * Called when user sends /start to the bot.
   * Generates a new random token, saves the hash, returns the plain token.
   */
  async registerOrRefreshToken(telegramId: string): Promise<string> {
    let user = await this.userRepository.findOne({ where: { telegramId } });

    if (!user) {
      user = this.userRepository.create({
        telegramId,
        role: UserRole.USER,
      });
    }

    // 1. Generate a random strong token (e.g., "a1b2c3d4...")
    const rawToken = crypto.randomBytes(32).toString('hex');
    
    // 2. Hash it (SHA-256)
    user.accessTokenHash = this.hashToken(rawToken);
    
    // 3. Save user with new hash
    await this.userRepository.save(user);

    // 4. Return raw token (to be sent via Telegram ONE TIME)
    return rawToken;
  }

  /**
   * 2. LOGIN
   * Called by Frontend with Telegram ID and Plain Token.
   */
  async login(telegramId: string, token: string) {
    // Fetch user AND the hidden hash
    const user = await this.userRepository.createQueryBuilder('user')
      .addSelect('user.accessTokenHash')
      .where('user.telegramId = :telegramId', { telegramId })
      .getOne();

    if (!user || !user.accessTokenHash) {
      throw new UnauthorizedException('User not found or invalid credentials');
    }

    // Hash the input token
    const hashedInput = this.hashToken(token);
    
    // Secure comparison (prevent timing attacks)
    const hashBuffer = Buffer.from(user.accessTokenHash);
    const inputBuffer = Buffer.from(hashedInput);

    // Ensure buffers have same length before comparing (timing attack mitigation)
    if (hashBuffer.length !== inputBuffer.length) {
        throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = crypto.timingSafeEqual(hashBuffer, inputBuffer);

    if (!isValid) {
        throw new UnauthorizedException('Invalid credentials');
    }

    // Return public user info
    return {
        status: 'success',
        user: {
            id: user.id,
            telegramId: user.telegramId,
            role: user.role
        }
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}