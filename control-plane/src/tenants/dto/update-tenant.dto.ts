import { IsString, IsEmail, IsIn, IsOptional, IsObject } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsIn(['pending','active','suspended','cancelled']) status?: string;
  @IsOptional() @IsString() subdomain?: string;
  @IsOptional() @IsString() custom_domain?: string;
  @IsOptional() @IsObject() features?: Record<string, any>;
  @IsOptional() @IsObject() limits?: Record<string, any>;
  @IsOptional() @IsObject() branding?: Record<string, any>;
  @IsOptional() @IsObject() settings?: Record<string, any>;
  @IsOptional() @IsObject() address?: Record<string, any>;
}
