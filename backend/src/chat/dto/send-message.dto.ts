import {
  IsString,
  IsArray,
  IsOptional,
  IsIn,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChatHistoryMessageDto {
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryMessageDto)
  @ArrayMaxSize(20)
  history?: ChatHistoryMessageDto[];
}
