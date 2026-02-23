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
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepo: Repository<Post>,
  ) {}

  async findAll(): Promise<Post[]> {
    return this.postsRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Post> {
    const post = await this.postsRepo.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException(`Post #${id} not found`);
    }
    return post;
  }

  async findOneAndIncrementViews(id: number): Promise<Post> {
    const post = await this.findOne(id);
    post.views += 1;
    return this.postsRepo.save(post);
  }

  async create(createPostDto: CreatePostDto, author: JwtPayload): Promise<Post> {
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

    if (post.author.id !== currentUser.id) {
      throw new ForbiddenException('You can only edit your own posts.');
    }

    Object.assign(post, updatePostDto);
    return this.postsRepo.save(post);
  }

  async remove(id: number, currentUser: JwtPayload): Promise<void> {
    const post = await this.findOne(id);

    if (post.author.id !== currentUser.id) {
      throw new ForbiddenException('You can only delete your own posts.');
    }

    await this.postsRepo.remove(post);
  }
}
