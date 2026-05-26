import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Generated,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Generated('uuid')
  uid: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ length: 63, nullable: true, unique: true })
  subdomain: string;

  @Column({ length: 255, nullable: true, unique: true })
  custom_domain: string;

  @Column({ length: 50 })
  type: string;

  @Column({ length: 20, default: 'free' })
  plan: string;

  @Column({ length: 20, default: 'monthly' })
  billing_cycle: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  website: string;

  @Column({ type: 'jsonb', default: {} })
  address: Record<string, any>;

  @Column({ nullable: true })
  registration_number: string;

  @Column({ nullable: true })
  tax_id: string;

  @Column({ type: 'jsonb', default: {} })
  limits: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  features: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  branding: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  usage: Record<string, any>;

  @Column({ nullable: true })
  owner_id: number;

  @Column({ nullable: true })
  admin_user_id: number;

  @Column({ nullable: true })
  admin_email: string;

  @Column({ nullable: true })
  admin_password: string;

  @Column({ default: false })
  is_verified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  plan_start_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  plan_end_date: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
