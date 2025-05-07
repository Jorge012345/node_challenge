import { SQSEvent, SQSRecord } from 'aws-lambda';
import { handler } from './appointment-pe';
import { NestFactory } from '@nestjs/core';
import { DatabaseService } from '../services/database.service';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { AppModule } from '../app.module';
import { Logger, INestApplicationContext } from '@nestjs/common';

jest.mock('@nestjs/common', () => {
  const actualCommon = jest.requireActual('@nestjs/common');
  return {
    ...actualCommon,
    Logger: jest.fn().mockImplementation(() => ({
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    })),
  };
});

const mockSaveAppointment = jest.fn();
const mockDatabaseService = {
  saveAppointment: mockSaveAppointment,
};

const mockAppGet = jest.fn();
const mockAppInit = jest.fn().mockResolvedValue(undefined);

let mockCreateApplicationContextHandler = jest.fn().mockResolvedValue({
  get: mockAppGet,
  init: mockAppInit,
} as unknown as INestApplicationContext);

jest.mock('@nestjs/core', () => {
  const originalNestCore = jest.requireActual('@nestjs/core');
  return {
    ...originalNestCore,
    NestFactory: {
      ...(originalNestCore.NestFactory || {}),
      createApplicationContext: (...args: any[]) => mockCreateApplicationContextHandler(...args),
    },
  };
});

const eventBridgeMock = mockClient(EventBridgeClient);

describe('AppointmentPEHandler', () => {
  let mockSqsEvent: SQSEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBridgeMock.reset();

    mockAppGet.mockImplementation((token) => {
      if (token === DatabaseService) {
        return mockDatabaseService;
      }
      return undefined;
    });
    mockCreateApplicationContextHandler.mockResolvedValue({
      get: mockAppGet,
      init: mockAppInit,
    } as unknown as INestApplicationContext);

    const mockRecordBody = {
      id: 'test-appointment-id-pe',
      insuredId: '12345PE',
      scheduleId: 1001,
      countryISO: 'PE',
    };
    const sqsRecord: SQSRecord = {
      messageId: 'mock-message-id',
      receiptHandle: 'mock-receipt-handle',
      body: JSON.stringify({ Message: JSON.stringify(mockRecordBody) }),
      attributes: {} as any,
      messageAttributes: {} as any,
      md5OfBody: 'mock-md5',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:TestQueuePE',
      awsRegion: 'us-east-1',
    };
    mockSqsEvent = { Records: [sqsRecord] };
    process.env.EVENT_BUS_NAME = 'TestEventBus-dev';
  });

  afterEach(() => {
    delete process.env.EVENT_BUS_NAME;
  });

  it('should process a valid SQS record, save to DB, and send EventBridge event', async () => {
    const savedAppointmentDetail = { id: 'db-detail-id', ...JSON.parse(JSON.parse(mockSqsEvent.Records[0].body).Message) };
    mockSaveAppointment.mockResolvedValue(savedAppointmentDetail);
    eventBridgeMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0, Entries: [{ EventId: 'evt-123'}] });

    await handler(mockSqsEvent);

    expect(mockCreateApplicationContextHandler).toHaveBeenCalledWith(AppModule, expect.any(Object));
    expect(mockAppInit).toHaveBeenCalled();
    expect(mockAppGet).toHaveBeenCalledWith(DatabaseService);
    expect(mockSaveAppointment).toHaveBeenCalledWith(JSON.parse(JSON.parse(mockSqsEvent.Records[0].body).Message));
    expect(eventBridgeMock).toHaveReceivedCommandWith(PutEventsCommand, {
      Entries: [
        expect.objectContaining({
          EventBusName: 'TestEventBus-dev',
          Source: 'appointment-service',
          DetailType: 'appointment.completed',
          Detail: JSON.stringify({
            id: 'test-appointment-id-pe',
            countryISO: 'PE',
            detail: {
              id: 'test-appointment-id-pe',
              appointmentDetail: savedAppointmentDetail,
            },
          }),
        }),
      ],
    });
  });

  it('should handle error if DatabaseService.saveAppointment fails', async () => {
    const dbError = new Error('DB save failed');
    mockSaveAppointment.mockRejectedValue(dbError);
    await handler(mockSqsEvent);
    expect(eventBridgeMock.commandCalls(PutEventsCommand).length).toBe(0);
  });

  it('should handle error if EventBridgeClient.send fails', async () => {
    const savedAppointmentDetail = { id: 'db-detail-id', ...JSON.parse(JSON.parse(mockSqsEvent.Records[0].body).Message) };
    mockSaveAppointment.mockResolvedValue(savedAppointmentDetail);
    const ebError = new Error('EventBridge send failed');
    eventBridgeMock.on(PutEventsCommand).rejects(ebError);
    await handler(mockSqsEvent);
  });

  it('should handle JSON parsing error for record.body', async () => {
    const malformedRecord: SQSRecord = { ...mockSqsEvent.Records[0], body: 'not-a-json' };
    mockSqsEvent.Records = [malformedRecord];
    await handler(mockSqsEvent);
    expect(mockSaveAppointment).not.toHaveBeenCalled();
    expect(eventBridgeMock.commandCalls(PutEventsCommand).length).toBe(0);
  });

  it('should handle JSON parsing error for body.Message', async () => {
    const malformedMessageRecord: SQSRecord = { ...mockSqsEvent.Records[0], body: JSON.stringify({ Message: 'still-not-json' }) };
    mockSqsEvent.Records = [malformedMessageRecord];
    await handler(mockSqsEvent);
    expect(mockSaveAppointment).not.toHaveBeenCalled();
    expect(eventBridgeMock.commandCalls(PutEventsCommand).length).toBe(0);
  });

  it('should process multiple records in a single SQS event', async () => {
    const recordBody1 = { id: 'rec1', insuredId: 'insPE1', scheduleId: 101, countryISO: 'PE' };
    const recordBody2 = { id: 'rec2', insuredId: 'insPE2', scheduleId: 102, countryISO: 'PE' };
    const sqsRecord1: SQSRecord = { ...mockSqsEvent.Records[0], body: JSON.stringify({ Message: JSON.stringify(recordBody1) }) };
    const sqsRecord2: SQSRecord = { ...mockSqsEvent.Records[0], messageId: 'msg2', body: JSON.stringify({ Message: JSON.stringify(recordBody2) }) };
    mockSqsEvent.Records = [sqsRecord1, sqsRecord2];
    const { id: ignoredId1, ...restOfRecordBody1 } = recordBody1;
    const { id: ignoredId2, ...restOfRecordBody2 } = recordBody2;
    mockSaveAppointment
        .mockResolvedValueOnce({ id: 'db-detail-rec1', ...restOfRecordBody1, status: 'completed', createdAt: new Date(), updatedAt: new Date() })
        .mockResolvedValueOnce({ id: 'db-detail-rec2', ...restOfRecordBody2, status: 'completed', createdAt: new Date(), updatedAt: new Date() });
    eventBridgeMock.on(PutEventsCommand).resolves({});
    await handler(mockSqsEvent);
    expect(mockSaveAppointment).toHaveBeenCalledTimes(2);
    expect(mockSaveAppointment).toHaveBeenCalledWith(recordBody1);
    expect(mockSaveAppointment).toHaveBeenCalledWith(recordBody2);
    expect(eventBridgeMock.commandCalls(PutEventsCommand).length).toBe(2);
  });

  describe('Memoization of Nest App Context', () => {
    let freshHandler: (event: SQSEvent) => Promise<void>;

    beforeEach(async () => {
      mockCreateApplicationContextHandler.mockClear();
      mockAppInit.mockClear();
      mockSaveAppointment.mockClear();
      eventBridgeMock.reset();
      mockAppGet.mockClear();
      mockAppGet.mockImplementation((tokenOrClass: any) => {
        if (typeof tokenOrClass === 'function' && tokenOrClass.name === 'DatabaseService') {
          return mockDatabaseService; 
        }
        
        return undefined;
      });

      mockCreateApplicationContextHandler.mockResolvedValue({
        get: mockAppGet,
        init: mockAppInit, 
      } as unknown as INestApplicationContext);

      jest.resetModules();
      
      const handlerModule = await import('./appointment-pe');
      freshHandler = handlerModule.handler;
      
      const mockRecordBodyMemo = { id: 'memo-test-id', insuredId: 'memoInsPE', scheduleId: 2001, countryISO: 'PE' };
      const sqsRecordMemo: SQSRecord = {
         messageId: 'memo-msg-id', receiptHandle: 'memo-receipt-handle',
         body: JSON.stringify({ Message: JSON.stringify(mockRecordBodyMemo) }),
         attributes: {} as any, messageAttributes: {} as any, md5OfBody: 'memo-md5',
         eventSource: 'aws:sqs', eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:TestQueueMemo', awsRegion: 'us-east-1',
       };
      (mockSqsEvent as any) = { Records: [sqsRecordMemo] }; 
      process.env.EVENT_BUS_NAME = 'TestEventBus-Memo-dev'; 
    });

    afterEach(() => {
      delete process.env.EVENT_BUS_NAME;
    });

    it('should initialize Nest app context only once for multiple calls', async () => {
      mockSaveAppointment.mockResolvedValue({ id: 'detail-mem-1', insuredId: 'memoInsPE', scheduleId: 2001, countryISO: 'PE', status: 'completed', createdAt: new Date(), updatedAt: new Date() });
      eventBridgeMock.on(PutEventsCommand).resolves({});

      await freshHandler(mockSqsEvent); 
      await freshHandler(mockSqsEvent); 

      expect(mockCreateApplicationContextHandler).toHaveBeenCalledTimes(1);
      expect(mockAppInit).toHaveBeenCalledTimes(1);
      expect(mockSaveAppointment).toHaveBeenCalledTimes(2);
      expect(mockAppGet).toHaveBeenCalledWith(expect.objectContaining({ name: 'DatabaseService' }));
    });
  });
}); 