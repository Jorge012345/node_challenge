import { Injectable, Logger } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  PutItemCommand, 
  GetItemCommand, 
  UpdateItemCommand, 
  QueryCommand 
} from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { Appointment, AppointmentStatus } from '../models/appointment.model';
import { IDynamoDBService } from '../interfaces/aws-services.interface';

@Injectable()
export class DynamoDBService implements IDynamoDBService {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;
  private readonly logger = new Logger(DynamoDBService.name);

  constructor() {
    this.client = new DynamoDBClient({});
    this.tableName = process.env.DYNAMODB_TABLE_NAME || 'AppointmentTable-dev';
    this.logger.log(`Initialized DynamoDB service with table: ${this.tableName}`);
  }

  async saveAppointment(appointment: Appointment): Promise<Appointment> {
    this.logger.log(`Saving appointment to DynamoDB: ${JSON.stringify(appointment)}`);
    
    try {
      if (!appointment.id) {
        appointment.id = uuidv4();
      }
      
      const now = new Date().toISOString();
      appointment.createdAt = appointment.createdAt || now;
      appointment.updatedAt = now;
      appointment.status = appointment.status || AppointmentStatus.PENDING;

      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: {
          id: { S: appointment.id },
          insuredId: { S: appointment.insuredId },
          scheduleId: { N: appointment.scheduleId.toString() },
          countryISO: { S: appointment.countryISO },
          status: { S: appointment.status },
          createdAt: { S: appointment.createdAt },
          updatedAt: { S: appointment.updatedAt },
        },
      });

      await this.client.send(command);
      this.logger.log(`Successfully saved appointment with ID: ${appointment.id}`);
      return appointment;
    } catch (error) {
      this.logger.error(`Error saving to DynamoDB: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAppointmentsByInsuredId(insuredId: string): Promise<Appointment[]> {
    this.logger.log(`Getting appointments for insuredId: ${insuredId}`);
    
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'InsuredIdIndex',
        KeyConditionExpression: 'insuredId = :insuredId',
        ExpressionAttributeValues: {
          ':insuredId': { S: insuredId },
        },
      });

      const response = await this.client.send(command);
      
      if (!response.Items || response.Items.length === 0) {
        this.logger.log(`No appointments found for insuredId: ${insuredId}`);
        return [];
      }
      
      this.logger.log(`Found ${response.Items.length} appointments for insuredId: ${insuredId}`);
      return response.Items.map((item) => ({
        id: item.id.S || '',
        insuredId: item.insuredId.S || '',
        scheduleId: parseInt(item.scheduleId.N || '0'),
        countryISO: item.countryISO.S || '',
        status: (item.status.S as AppointmentStatus) || AppointmentStatus.PENDING,
        createdAt: item.createdAt.S || '',
        updatedAt: item.updatedAt.S || '',
      }));
    } catch (error) {
      this.logger.error(`Error querying DynamoDB: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateAppointmentStatus(id: string, status: string): Promise<Appointment> {
    this.logger.log(`Updating appointment status for ID: ${id} to status: ${status}`);
    
    try {
      const now = new Date().toISOString();
      
      const command = new UpdateItemCommand({
        TableName: this.tableName,
        Key: {
          id: { S: id },
        },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': { S: status },
          ':updatedAt': { S: now },
        },
        ReturnValues: 'ALL_NEW',
      });

      const response = await this.client.send(command);
      
      if (!response.Attributes) {
        this.logger.error(`Appointment with id ${id} not found`);
        throw new Error(`Appointment with id ${id} not found`);
      }
      
      const attributes = response.Attributes;
      
      this.logger.log(`Successfully updated appointment status for ID: ${id}`);
      return {
        id: attributes.id.S || '',
        insuredId: attributes.insuredId.S || '',
        scheduleId: parseInt(attributes.scheduleId.N || '0'),
        countryISO: attributes.countryISO.S || '',
        status: (attributes.status.S as AppointmentStatus) || AppointmentStatus.PENDING,
        createdAt: attributes.createdAt.S || '',
        updatedAt: attributes.updatedAt.S || '',
      };
    } catch (error) {
      this.logger.error(`Error updating DynamoDB: ${error.message}`, error.stack);
      throw error;
    }
  }
} 