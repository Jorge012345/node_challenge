import { Injectable, Logger } from '@nestjs/common';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { Appointment } from '../models/appointment.model';
import { ISNSService } from '../interfaces/aws-services.interface';

@Injectable()
export class SNSService implements ISNSService {
  private readonly client: SNSClient;
  private readonly topicArn: string;
  private readonly logger = new Logger(SNSService.name);

  constructor() {
    this.client = new SNSClient({});
    this.topicArn = process.env.SNS_TOPIC_ARN || 'arn:aws:sns:us-east-1:000000000000:AppointmentTopic-dev';
    this.logger.log(`Initialized SNS service with topic: ${this.topicArn}`);
  }

  async publishAppointment(appointment: Appointment): Promise<void> {
    this.logger.log(`Publishing appointment to SNS: ${JSON.stringify(appointment)}`);
    
    try {
      const message = JSON.stringify(appointment);
      
      const command = new PublishCommand({
        TopicArn: this.topicArn,
        Message: message,
        MessageAttributes: {
          countryISO: {
            DataType: 'String',
            StringValue: appointment.countryISO,
          },
        },
      });

      const result = await this.client.send(command);
      this.logger.log(`Successfully published to SNS with MessageId: ${result.MessageId}`);
    } catch (error) {
      this.logger.error(`Error publishing to SNS: ${error.message}`, error.stack);
      throw error;
    }
  }
} 