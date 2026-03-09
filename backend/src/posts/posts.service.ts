import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from './post.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { User } from '../users/user.entity';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepo: Repository<Post>,
  ) {}

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Post>> {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const qb = this.postsRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .orderBy('post.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (search) {
      const escaped = search.replace(/[%_\\]/g, '\\$&');
      qb.where(
        'post.title ILIKE :search OR post.content ILIKE :search',
        { search: `%${escaped}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<Post> {
    const post = await this.postsRepo.findOne({ where: { id }, relations: ['author'] });
    if (!post) {
      throw new NotFoundException(`Post #${id} not found`);
    }
    return post;
  }

  async findOneAndIncrementViews(id: number): Promise<Post> {
    await this.postsRepo.increment({ id }, 'views', 1);
    return this.findOne(id);
  }

  async create(
    createPostDto: CreatePostDto,
    author: JwtPayload,
  ): Promise<Post> {
    const post = this.postsRepo.create({
      ...createPostDto,
      author: { id: author.id } as User,
    });
    return this.postsRepo.save(post);
  }

  async update(
    id: number,
    updatePostDto: UpdatePostDto,
    currentUser: JwtPayload,
  ): Promise<Post> {
    const post = await this.findOne(id);

    if (!post.author || post.author.id !== currentUser.id) {
      throw new ForbiddenException('You can only edit your own posts.');
    }

    Object.assign(post, updatePostDto);
    return this.postsRepo.save(post);
  }

  async remove(id: number, currentUser: JwtPayload): Promise<void> {
    const post = await this.findOne(id);

    if (!post.author || post.author.id !== currentUser.id) {
      throw new ForbiddenException('You can only delete your own posts.');
    }

    await this.postsRepo.remove(post);
  }
}
