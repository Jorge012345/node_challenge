import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { Appointment, AppointmentStatus } from '../models/appointment.model';
import { DynamoDBService } from './dynamodb.service';
import { SNSService } from './sns.service';

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private readonly dynamoDBService: DynamoDBService,
    private readonly snsService: SNSService,
  ) {}

  async createAppointment(createAppointmentDto: CreateAppointmentDto): Promise<Appointment> {
    
    const appointment: Appointment = {
      id: uuidv4(),
      insuredId: createAppointmentDto.insuredId,
      scheduleId: createAppointmentDto.scheduleId,
      countryISO: createAppointmentDto.countryISO,
      status: AppointmentStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const savedAppointment = await this.dynamoDBService.saveAppointment(appointment);
    this.logger.log(`Appointment saved to DynamoDB: ${savedAppointment.id}`);

    this.logger.log(`Publishing appointment ${savedAppointment.id} to SNS...`);
    await this.snsService.publishAppointment(savedAppointment);
    this.logger.log(`Appointment ${savedAppointment.id} published to SNS successfully.`);

    return savedAppointment;
  }

  async getAppointmentsByInsuredId(insuredId: string): Promise<Appointment[]> {
    return this.dynamoDBService.getAppointmentsByInsuredId(insuredId);
  }

  async updateAppointmentStatus(id: string, status: string): Promise<Appointment> {
    return this.dynamoDBService.updateAppointmentStatus(id, status);
  }
} 