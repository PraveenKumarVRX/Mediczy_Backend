import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('provider_clinics')
export class Clinic {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() name: string;
  @Column({ nullable: true }) email: string;
  @Column({ nullable: true }) phone: string;
  @Column({ nullable: true }) type: string;
  @Column({ nullable: true }) specialty: string;
  @Column({ type: 'jsonb', nullable: true }) location: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true }) services: Record<string, any>;
  @Column({ default: 'active' }) status: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
