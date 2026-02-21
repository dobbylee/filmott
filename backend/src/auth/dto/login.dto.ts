import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: 'Email cannot be empty.' })
  @IsEmail({}, { message: 'Must be a valid email format.' })
  email!: string;

  @IsNotEmpty({ message: 'Password cannot be empty.' })
  @IsString()
  @MinLength(4, { message: 'Password must be at least 4 characters long.' })
  password!: string;
}
