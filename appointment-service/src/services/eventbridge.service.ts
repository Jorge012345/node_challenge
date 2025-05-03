import { Injectable } from '@nestjs/common';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { IEventBridgeService } from '../interfaces/aws-services.interface';

@Injectable()
export class EventBridgeService implements IEventBridgeService {
  private readonly client: EventBridgeClient;

  constructor() {
    this.client = new EventBridgeClient({});
  }

  async putEvent(
    eventBusName: string,
    source: string,
    detailType: string,
    detail: any,
  ): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [
        {
          EventBusName: eventBusName,
          Source: source,
          DetailType: detailType,
          Detail: JSON.stringify(detail),
        },
      ],
    });

    await this.client.send(command);
  }
} 