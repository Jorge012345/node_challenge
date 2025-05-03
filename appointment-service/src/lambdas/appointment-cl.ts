import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SQSEvent } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { DatabaseService } from '../services/database.service';
import { Logger } from '@nestjs/common';
import { INestApplicationContext } from '@nestjs/common';

const logger = new Logger('AppointmentCLHandler');
let app: INestApplicationContext;


async function bootstrap(): Promise<INestApplicationContext> {
  if (!app) {
    logger.log('Initializing NestJS application context...');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: process.env.NODE_ENV === 'development' ? new Logger() : ['error', 'warn'],
    });
    await app.init();
    logger.log('NestJS application context initialized.');
  }
  return app;
}


export const handler = async (event: SQSEvent): Promise<void> => {
  try {
    const appContext = await bootstrap();
    const databaseService = appContext.get(DatabaseService);
    const eventBridgeClient = new EventBridgeClient({}); 

    logger.log('Processing appointments for Chile');
    
    for (const record of event.Records) {
      try {
        const body = JSON.parse(record.body);
        const message = typeof body.Message === 'string' 
          ? JSON.parse(body.Message) 
          : body.Message;
        
        logger.log(`Processing appointment: ${JSON.stringify(message)}`);
        
        const savedAppointment = await databaseService.saveAppointment(message);
        logger.log(`Appointment saved to RDS: ${JSON.stringify(savedAppointment)}`);

        const command = new PutEventsCommand({
          Entries: [
            {
              EventBusName: process.env.EVENT_BUS_NAME || 'AppointmentEventBus-dev',
              Source: 'appointment-service',
              DetailType: 'appointment.completed',
              Detail: JSON.stringify({
                id: message.id,
                countryISO: 'CL',
                detail: {
                  id: message.id,
                  appointmentDetail: savedAppointment,
                },
              }),
            },
          ],
        });
        
        const result = await eventBridgeClient.send(command);
        logger.log(`EventBridge result: ${JSON.stringify(result)}`);
        logger.log(`Appointment notification sent for: ${message.id}`);
      } catch (recordError) {
        logger.error(`Error processing record: ${JSON.stringify(record)}`, recordError.stack);
      }
    }
  } catch (error) {
    logger.error(`Error processing Chile appointments: ${error.message}`, error.stack);
    throw error;
  }
}; 