import { Injectable } from '@nestjs/common';
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { ISQSService } from '../interfaces/aws-services.interface';

@Injectable()
export class SQSService implements ISQSService {
  private readonly client: SQSClient;

  constructor() {
    this.client = new SQSClient({});
  }

  async sendMessage(queueUrl: string, message: any): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
    });

    await this.client.send(command);
  }

  async receiveMessage(queueUrl: string): Promise<any> {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
    });

    const response = await this.client.send(command);
    return response.Messages && response.Messages.length > 0
      ? response.Messages[0]
      : null;
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });

    await this.client.send(command);
  }
} 