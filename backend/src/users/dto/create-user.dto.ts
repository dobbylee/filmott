import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Username is required.' })
  @IsString({ message: 'Username must be a string.' })
  username!: string;

  @IsNotEmpty({ message: 'Email is required.' })
  @IsEmail({}, { message: 'Must be a valid email format.' })
  email!: string;

  @IsNotEmpty({ message: 'Password is required.' })
  @IsString()
  @MinLength(4, { message: 'Password must be at least 4 characters long.' })
  password!: string;
}
