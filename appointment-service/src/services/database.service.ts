import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppointmentDetail } from '../models/appointment-detail.entity';
import { Appointment } from '../models/appointment.model';

@Injectable()
export class DatabaseService implements OnModuleInit {
  public dataSourcePE: DataSource | null = null;
  public dataSourceCL: DataSource | null = null;
  private readonly logger = new Logger(DatabaseService.name);

  constructor() {
    this.logger.log('DatabaseService instantiated.');
  }

  async onModuleInit(): Promise<void> {
    if (process.env.SHOULD_CONNECT_DB === 'true') {
      this.logger.log(`Database connection required (SHOULD_CONNECT_DB=${process.env.SHOULD_CONNECT_DB}), initializing in onModuleInit...`);
      await this.initializeDataSources();
    } else {
      this.logger.log(`Database connection not required (SHOULD_CONNECT_DB=${process.env.SHOULD_CONNECT_DB}), skipping initialization in onModuleInit.`);
    }
  }

  private async initializeDataSources() {
    try {
      this.dataSourcePE = new DataSource({
        type: 'mysql',
        host: process.env.RDS_HOST_PE || 'localhost',
        port: parseInt(process.env.RDS_PORT_PE || '3306'),
        username: process.env.RDS_USERNAME_PE || 'root',
        password: process.env.RDS_PASSWORD_PE || 'password',
        database: process.env.RDS_DATABASE_PE || 'appointments_pe',
        entities: [AppointmentDetail],
        synchronize: true,
      });
      this.dataSourceCL = new DataSource({
        type: 'mysql',
        host: process.env.RDS_HOST_CL || 'localhost',
        port: parseInt(process.env.RDS_PORT_CL || '3306'),
        username: process.env.RDS_USERNAME_CL || 'root',
        password: process.env.RDS_PASSWORD_CL || 'password',
        database: process.env.RDS_DATABASE_CL || 'appointments_cl',
        entities: [AppointmentDetail],
        synchronize: true,
      });
      await this.dataSourcePE.initialize();
      this.logger.log('Perú database connected successfully');
      
      await this.dataSourceCL.initialize();
      this.logger.log('Chile database connected successfully');
    } catch (error) {
      this.logger.error('Error initializing database connections', error);
      throw error;
    }
  }

  async saveAppointment(appointment: Appointment): Promise<AppointmentDetail> {
    const country = appointment.countryISO;
    const dataSource = country === 'PE' ? this.dataSourcePE : this.dataSourceCL;

    if (!dataSource) {
      this.logger.error(`DataSource for ${country} is null. Connection was likely not initialized for this lambda.`);
      throw new Error(`Database connection for ${country} is not available (DataSource is null)`);
    }

    if (!dataSource.isInitialized) {
      this.logger.error(`DataSource for ${country} is not initialized. Attempting connection...`);
      if (!dataSource.isInitialized) {
         throw new Error(`Database connection for ${country} is not available (not initialized)`);
      }
      this.logger.log(`DataSource for ${country} initialized successfully.`);
    }

    const repository = dataSource.getRepository(AppointmentDetail);
    
    const appointmentDetail = repository.create({
      insuredId: appointment.insuredId,
      scheduleId: appointment.scheduleId,
      countryISO: appointment.countryISO,
      status: 'completed',
    });

    return repository.save(appointmentDetail);
  }

  async closeConnections() {
    if (this.dataSourcePE && this.dataSourcePE.isInitialized) {
      await this.dataSourcePE.destroy();
      this.logger.log('Perú database connection closed.');
    }
    
    if (this.dataSourceCL && this.dataSourceCL.isInitialized) {
      await this.dataSourceCL.destroy();
      this.logger.log('Chile database connection closed.');
    }
  }
} 