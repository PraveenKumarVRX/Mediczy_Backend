import {
  IsString, IsEmail, IsIn, IsOptional, IsInt, MinLength, IsObject,
} from 'class-validator';

const ENTITY_TYPES = [
  'hospital','clinic','lab','pharmacy','ambulance',
  'corporate','tpa','psu','insurer','broker','ngo','homecare',
] as const;

export class CreateTenantDto {
  @IsString() name: string;
  @IsIn(ENTITY_TYPES) type: string;
  @IsIn(['free','professional','enterprise']) plan: string;
  @IsEmail() email: string;
  @IsString() phone: string;

  @IsOptional() @IsIn(['monthly','quarterly','annual']) billing_cycle?: string;
  @IsOptional() @IsString() subdomain?: string;
  @IsOptional() @IsString() custom_domain?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsObject() address?: Record<string, any>;
  @IsOptional() @IsString() registration_number?: string;
  @IsOptional() @IsString() tax_id?: string;
  @IsOptional() @IsEmail() admin_email?: string;
  @IsOptional() @IsString() @MinLength(8) admin_password?: string;
  @IsOptional() @IsString() admin_first_name?: string;
  @IsOptional() @IsString() admin_last_name?: string;
  @IsOptional() @IsInt() parent_organization_id?: number;
  @IsOptional() @IsObject() branding?: Record<string, any>;
  @IsOptional() @IsObject() settings?: Record<string, any>;
}
