import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class AppointmentDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 5 })
  insuredId: string;

  @Column()
  scheduleId: number;

  @Column({ length: 2 })
  countryISO: string;

  @Column({ default: 'completed' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 