import {
  IsEmail, IsString, IsNotEmpty, MinLength, IsEnum,
  IsOptional, IsDateString, IsPhoneNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty() @IsString() @IsNotEmpty() firstName: string;
  @ApiProperty() @IsString() @IsNotEmpty() lastName:  string;
  @ApiProperty() @IsEmail()                            email:    string;
  @ApiProperty() @IsString() @MinLength(8)             password: string;
  @ApiProperty() @IsDateString()                       dateOfBirth: string;
  @ApiProperty({ enum: ['Male','Female','Other'] })
  @IsEnum(['Male','Female','Other'])                   gender: string;
  @ApiProperty() @IsString()                           phoneNumber: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() role?: string;
  @ApiProperty({ required: false }) @IsOptional()      organizationId?: number;
}

export class UpdateUserDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lastName?:  string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phoneNumber?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(8) password?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() profileImage?: string;
  @ApiProperty({ required: false }) @IsOptional()              preferences?: Record<string, unknown>;
}
