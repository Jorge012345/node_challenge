import { SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { AppointmentStatus } from '../models/appointment.model';
import { Logger } from '@nestjs/common';

const dynamoDBClient = new DynamoDBClient({});
const tableName = process.env.DYNAMODB_TABLE_NAME || 'AppointmentTable-dev';
const logger = new Logger('NotificationProcessor');

export const handler = async (event: SQSEvent): Promise<void> => {
  try {
    logger.log('Processing notifications');
    
    for (const record of event.Records) {
      try {
        const body = typeof record.body === 'string' 
          ? JSON.parse(record.body) 
          : record.body;
        
        logger.log(`Processing notification: ${JSON.stringify(body)}`);
        
        let appointmentId: string;
        
        if (body.detail && body.detail.id) {
          appointmentId = body.detail.id;
        } else if (body.detail && body.detail.detail && body.detail.detail.id) {
          appointmentId = body.detail.detail.id;
        } else if (body.id) {
          appointmentId = body.id;
        } else {
          throw new Error('Invalid message format: cannot find appointment ID');
        }
        
        logger.log(`Updating appointment status for ID: ${appointmentId}`);
        
        const command = new UpdateItemCommand({
          TableName: tableName,
          Key: {
            id: { S: appointmentId },
          },
          UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':status': { S: AppointmentStatus.COMPLETED },
            ':updatedAt': { S: new Date().toISOString() },
          },
          ReturnValues: 'ALL_NEW',
        });
        
        const response = await dynamoDBClient.send(command);
        if (response.Attributes) {
          logger.log(`Appointment status updated: ${JSON.stringify(response.Attributes)}`);
        } else {
          logger.warn(`No appointment found with ID: ${appointmentId}`);
        }
      } catch (recordError) {
        logger.error(`Error processing record: ${JSON.stringify(record)}`, recordError.stack);
      }
    }
  } catch (error) {
    logger.error(`Error processing notifications: ${error.message}`, error.stack);
    throw error;
  }
}; 