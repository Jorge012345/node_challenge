import { Test, TestingModule } from '@nestjs/testing';
import { EventBridgeService } from './eventbridge.service';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

describe('EventBridgeService', () => {
  let service: EventBridgeService;
  let eventBridgeMock;

  beforeAll(() => {
    eventBridgeMock = mockClient(EventBridgeClient);
  });

  beforeEach(async () => {
    eventBridgeMock.reset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [EventBridgeService],
    }).compile();

    service = module.get<EventBridgeService>(EventBridgeService);
  });

  afterAll(() => {
    eventBridgeMock.restore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('putEvent', () => {
    const testEventBusName = 'TestEventBus';
    const testSource = 'com.mycompany.testapp';
    const testDetailType = 'TestEventOccurred';
    const testDetail = { data: 'sample_data', id: 123 };

    it('should send an event to EventBridge successfully', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0, Entries: [{ EventId: 'mock-event-id' }] });

      await service.putEvent(testEventBusName, testSource, testDetailType, testDetail);

      expect(eventBridgeMock).toHaveReceivedCommandWith(PutEventsCommand, {
        Entries: [
          {
            EventBusName: testEventBusName,
            Source: testSource,
            DetailType: testDetailType,
            Detail: JSON.stringify(testDetail),
          },
        ],
      });
    });

    it('should throw an error if EventBridge PutEventsCommand fails', async () => {
      const errorMessage = 'EventBridge put error';
      eventBridgeMock.on(PutEventsCommand).rejects(new Error(errorMessage));

      await expect(
        service.putEvent(testEventBusName, testSource, testDetailType, testDetail)
      ).rejects.toThrow(errorMessage);
    });
    
    it('should handle scenarios where PutEventsCommand indicates failed entries', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({ 
        FailedEntryCount: 1, 
        Entries: [
          { ErrorCode: 'InternalError', ErrorMessage: 'Mock internal error' }
        ]
      });
      await expect(service.putEvent(testEventBusName, testSource, testDetailType, testDetail)).resolves.toBeUndefined();
      
       expect(eventBridgeMock).toHaveReceivedCommandWith(PutEventsCommand, {
        Entries: [expect.objectContaining({ DetailType: testDetailType })],
      });
    });
  });
}); 