
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
   */
  async registerOrRefreshToken(telegramId: string): Promise<string> {
    let user = await this.userRepository.findOne({ where: { telegramId } });

    if (!user) {
      user = this.userRepository.create({
        telegramId,
        role: UserRole.USER,
      });
    }

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
            role: user.role
        }
    };
  }

  /**
   * 3. VERIFY SESSION (For Guard)
   */
  async verifySession(token: string): Promise<User> {
    // We can't query by hash directly easily if we don't have the ID.
    // However, for this simple arch, we assume the client might send ID or we iterate/lookup.
    // OPTIMIZATION: In a real app, the token should be `ID:SECRET`. 
    // Let's assume the frontend sends just the secret. We have to query users or change the token format.
    // TO FIX: We will assume the user provides `TelegramID` in headers OR we scan (inefficient).
    // BETTER: Let's stick to the security best practice: Token = `id.secret` encoded base64?
    // FOR SIMPLICITY HERE: We hash the incoming token and look for it. 
    // Note: This requires the hash to be unique (collision unlikely with SHA256).
    
    const hashedInput = this.hashToken(token);
    
    // We must find the user by this hash. 
    // Since `accessTokenHash` is `select: false`, we need QueryBuilder.
    const user = await this.userRepository.createQueryBuilder('user')
      .addSelect('user.accessTokenHash')
      .where('user.accessTokenHash = :hash', { hash: hashedInput })
      .getOne();

    if (!user) return null;

    // Strip sensitive data before returning
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
