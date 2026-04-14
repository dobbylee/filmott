import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import sharp from 'sharp';
import { User, SafeUser } from './user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Review } from '../reviews/review.entity';
import { Watchlist } from '../watchlist/watchlist.entity';
import { R2StorageService } from '../common/r2-storage.service';
import { AuthProvider } from './enums/auth-provider.enum';
import { UserStatus } from './enums/user-status.enum';
import { UserRole } from './enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminGetUsersDto } from './dto/admin-get-users.dto';
import { VALID_OTT_IDS } from '../common/ott-providers';
import * as bcrypt from 'bcrypt';

export interface AdminUsersResult {
  users: SafeUser[];
  total: number;
  page: number;
  totalPages: number;
}

export interface PublicProfile {
  id: number;
  nickname: string;
  profileImage: string | null;
  createdAt: Date;
  reviewCount: number;
  watchedCount: number;
  wantToWatchCount: number;
}

/** 프로필 이미지 업로드 허용 MIME 타입 */
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
/** 프로필 이미지 업로드 최대 크기 (5MB) */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Watchlist)
    private readonly watchlistRepo: Repository<Watchlist>,
    private readonly r2Storage: R2StorageService,
  ) {}

  /**
   * 닉네임으로 사용자 조회 (DELETED 제외)
   * ACTIVE + SUSPENDED 모두 포함 -- 닉네임 중복 체크 시 정지된 계정도 잡아야 함
   */
  async findOne(nickname: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { nickname, status: Not(UserStatus.DELETED) },
    });
  }

  /**
   * 이메일로 사용자 조회 (DELETED 제외)
   * ACTIVE + SUSPENDED 모두 포함 -- 탈퇴 유저의 이메일 재사용 허용
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email, status: Not(UserStatus.DELETED) },
    });
  }

  /**
   * provider + providerId로 사용자 조회 (DELETED 제외)
   */
  async findByProvider(
    provider: AuthProvider,
    providerId: string,
  ): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { provider, providerId, status: Not(UserStatus.DELETED) },
    });
  }

  async isNicknameAvailable(nickname: string): Promise<boolean> {
    const existing = await this.findOne(nickname);
    return !existing;
  }

  async verifyPassword(id: number, password: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user || user.status !== UserStatus.ACTIVE || !user.password)
      return false;
    return bcrypt.compare(password, user.password);
  }

  async findById(id: number): Promise<SafeUser | null> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) return null;
    return this.toSafeUser(user);
  }

  /**
   * 공개 프로필 조회
   * DELETED 유저: NotFoundException
   * SUSPENDED 유저: 닉네임 마스킹, 통계 0
   */
  async getPublicProfile(userId: number): Promise<PublicProfile> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || user.status === UserStatus.DELETED) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      return {
        id: user.id,
        nickname: '정지된 사용자',
        profileImage: null,
        createdAt: user.createdAt,
        reviewCount: 0,
        watchedCount: 0,
        wantToWatchCount: 0,
      };
    }

    const [reviewCount, watchlistCounts] = await Promise.all([
      this.reviewRepo.count({ where: { userId } }),
      this.watchlistRepo
        .createQueryBuilder('w')
        .select("COUNT(*) FILTER (WHERE w.status = 'watched')", 'watched')
        .addSelect("COUNT(*) FILTER (WHERE w.status = 'want_to_watch')", 'want')
        .where('w.userId = :userId', { userId })
        .getRawOne<{ watched: string; want: string }>(),
    ]);
    const watchedCount = parseInt(watchlistCounts?.watched ?? '0', 10);
    const wantToWatchCount = parseInt(watchlistCounts?.want ?? '0', 10);

    return {
      id: user.id,
      nickname: user.nickname,
      profileImage: user.profileImage ?? null,
      createdAt: user.createdAt,
      reviewCount,
      watchedCount,
      wantToWatchCount,
    };
  }

  /**
   * JWT validate용: status/role 확인을 위해 id, nickname, status, role 반환
   * password는 제외, status는 포함 (findById와 다른 점)
   */
  async findByIdWithStatus(
    id: number,
  ): Promise<Pick<
    User,
    'id' | 'nickname' | 'status' | 'role' | 'profileImage' | 'subscribedOtts'
  > | null> {
    const user = await this.usersRepo.findOne({
      where: { id },
      select: [
        'id',
        'nickname',
        'status',
        'role',
        'profileImage',
        'subscribedOtts',
      ],
    });
    return user ?? null;
  }

  private isReservedNickname(nickname: string): boolean {
    const reserved = ['admin', 'filmott', 'deleted'];
    const lower = nickname.toLowerCase();
    return reserved.some((w) => lower.startsWith(w));
  }

  async create(createUserDto: CreateUserDto): Promise<SafeUser> {
    const { nickname, email, password } = createUserDto;

    if (this.isReservedNickname(nickname)) {
      throw new ConflictException('사용할 수 없는 닉네임입니다.');
    }

    // Check if user already exists
    const existingNickname = await this.findOne(nickname);
    if (existingNickname) {
      throw new ConflictException('이미 사용 중인 닉네임입니다.');
    }
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = this.usersRepo.create({
      nickname,
      email,
      password: hashedPassword,
    });

    const savedUser = await this.usersRepo.save(newUser);

    // Return user without password
    return this.toSafeUser(savedUser);
  }

  /**
   * 소셜 유저 생성 (닉네임 + provider + providerId + email(nullable) + password null)
   */
  async createSocialUser(data: {
    nickname: string;
    provider: AuthProvider;
    providerId: string;
    email: string | null;
    profileImage: string | null;
    subscribedOtts?: string[];
  }): Promise<SafeUser> {
    if (this.isReservedNickname(data.nickname)) {
      throw new ConflictException('사용할 수 없는 닉네임입니다.');
    }

    const existingNickname = await this.findOne(data.nickname);
    if (existingNickname) {
      throw new ConflictException('이미 사용 중인 닉네임입니다.');
    }

    const newUser = this.usersRepo.create({
      nickname: data.nickname,
      email: data.email,
      password: null,
      provider: data.provider,
      providerId: data.providerId,
      profileImage: data.profileImage ?? undefined,
      subscribedOtts: data.subscribedOtts ?? [],
    });

    const savedUser = await this.usersRepo.save(newUser);
    return this.toSafeUser(savedUser);
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // Handle nickname change
    if (updateUserDto.nickname && updateUserDto.nickname !== user.nickname) {
      if (this.isReservedNickname(updateUserDto.nickname)) {
        throw new ConflictException('사용할 수 없는 닉네임입니다.');
      }
      const existing = await this.findOne(updateUserDto.nickname);
      if (existing) {
        throw new ConflictException('이미 사용 중인 닉네임입니다.');
      }
      user.nickname = updateUserDto.nickname;
    }

    // Handle password change (LOCAL 유저만 비밀번호 변경 가능)
    if (updateUserDto.newPassword) {
      if (!updateUserDto.currentPassword) {
        throw new BadRequestException(
          '비밀번호 변경을 위해 현재 비밀번호를 입력해주세요.',
        );
      }
      if (!user.password) {
        throw new BadRequestException(
          '소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다.',
        );
      }
      const isMatch = await bcrypt.compare(
        updateUserDto.currentPassword,
        user.password,
      );
      if (!isMatch) {
        throw new BadRequestException('현재 비밀번호가 올바르지 않습니다.');
      }
      user.password = await bcrypt.hash(updateUserDto.newPassword, 10);
    }

    const savedUser = await this.usersRepo.save(user);
    return this.toSafeUser(savedUser);
  }

  async deactivate(id: number): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // 해당 유저의 모든 refresh token 삭제 (탈퇴 후 기존 토큰으로 접근 차단)
    await this.refreshTokenRepo.delete({ userId: id });

    // R2 프로필 이미지가 있으면 삭제
    if (user.profileImage) {
      const key = this.extractR2Key(user.profileImage);
      if (key) {
        await this.r2Storage.delete(key);
      }
    }

    // Anonymize to release unique constraints
    const timestamp = Date.now();
    user.nickname = `deleted_${user.id}_${timestamp}`;
    user.email = `deleted_${user.id}_${timestamp}@deleted.local`;
    user.providerId = null;
    user.status = UserStatus.DELETED;
    await this.usersRepo.save(user);
  }

  /**
   * 관리자용 유저 목록 조회
   * DELETED 유저 제외, 닉네임/이메일 검색, 상태 필터, 페이지네이션
   */
  async findAllForAdmin(dto: AdminGetUsersDto): Promise<AdminUsersResult> {
    const page = Math.max(1, parseInt(dto.page ?? '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(dto.limit ?? '20', 10) || 20),
    );
    const skip = (page - 1) * limit;

    const queryBuilder = this.usersRepo
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.nickname',
        'user.email',
        'user.provider',
        'user.providerId',
        'user.profileImage',
        'user.status',
        'user.role',
        'user.createdAt',
      ])
      .where('user.status != :deleted', { deleted: UserStatus.DELETED });

    if (dto.status) {
      queryBuilder.andWhere('user.status = :status', { status: dto.status });
    }

    if (dto.search) {
      const escaped = dto.search
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      queryBuilder.andWhere(
        '(user.nickname ILIKE :search OR user.email ILIKE :search)',
        { search: `%${escaped}%` },
      );
    }

    queryBuilder.orderBy('user.createdAt', 'DESC').skip(skip).take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      users: users as SafeUser[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 관리자용 유저 상태 변경
   * DELETED 유저 변경 불가, ADMIN 유저 변경 불가
   * SUSPENDED로 변경 시 해당 유저의 모든 refresh token 삭제 (즉시 세션 무효화)
   */
  async updateStatusByAdmin(
    userId: number,
    status: UserStatus.ACTIVE | UserStatus.SUSPENDED,
  ): Promise<SafeUser> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (user.status === UserStatus.DELETED) {
      throw new BadRequestException('탈퇴한 유저의 상태는 변경할 수 없습니다.');
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('관리자 계정의 상태는 변경할 수 없습니다.');
    }

    user.status = status;
    const savedUser = await this.usersRepo.save(user);

    // SUSPENDED로 변경 시 해당 유저의 모든 refresh token 삭제 (즉시 세션 무효화)
    if (status === UserStatus.SUSPENDED) {
      await this.refreshTokenRepo.delete({ userId });
    }

    return this.toSafeUser(savedUser);
  }

  /**
   * 프로필 이미지 업로드
   * sharp로 200x200 리사이즈 + webp 변환 후 R2에 업로드
   */
  async updateProfileImage(
    userId: number,
    file: Express.Multer.File,
  ): Promise<SafeUser> {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        '지원하지 않는 이미지 형식입니다. (jpeg, png, webp, gif만 허용)',
      );
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new BadRequestException('이미지 크기는 5MB 이하만 허용됩니다.');
    }

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // 기존 R2 이미지가 있으면 삭제 (소셜 프로필 외부 URL은 삭제 대상 아님)
    if (user.profileImage) {
      const oldKey = this.extractR2Key(user.profileImage);
      if (oldKey) {
        await this.r2Storage.delete(oldKey);
      }
    }

    // sharp 리사이즈 + webp 변환
    const resizedBuffer = await sharp(file.buffer)
      .resize(200, 200, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    const key = `profiles/profile-${userId}-${Date.now()}.webp`;
    const url = await this.r2Storage.upload(key, resizedBuffer, 'image/webp');

    user.profileImage = url;
    const savedUser = await this.usersRepo.save(user);
    return this.toSafeUser(savedUser);
  }

  /**
   * 프로필 이미지 삭제
   */
  async removeProfileImage(userId: number): Promise<SafeUser> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (user.profileImage) {
      const key = this.extractR2Key(user.profileImage);
      if (key) {
        await this.r2Storage.delete(key);
      }
    }

    user.profileImage = undefined;
    const savedUser = await this.usersRepo.save(user);
    return this.toSafeUser(savedUser);
  }

  /**
   * OTT 구독 정보 업데이트
   * OTT_PROVIDERS에 정의된 id만 허용
   */
  async updateSubscribedOtts(
    userId: number,
    otts: string[],
  ): Promise<SafeUser> {
    const invalidOtts = otts.filter((id) => !VALID_OTT_IDS.includes(id));
    if (invalidOtts.length > 0) {
      throw new BadRequestException(
        `유효하지 않은 OTT: ${invalidOtts.join(', ')}`,
      );
    }

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    user.subscribedOtts = otts;
    const savedUser = await this.usersRepo.save(user);
    return this.toSafeUser(savedUser);
  }

  /**
   * R2 Public URL에서 키를 추출한다.
   * 외부 URL(소셜 프로필 이미지 등)은 null을 반환하여 삭제를 건너뛴다.
   */
  private extractR2Key(url: string): string | null {
    const publicUrl = this.r2Storage.getPublicUrl();
    if (!url.startsWith(publicUrl)) return null;
    return url.slice(publicUrl.length + 1); // +1 for '/'
  }

  private toSafeUser(user: User): SafeUser {
    const { password, ...safeUser } = user;
    void password;
    return safeUser;
  }
}
