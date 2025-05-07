import { SQSEvent, SQSRecord } from 'aws-lambda';
import { handler } from './appointment-cl';
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

describe('AppointmentCLHandler', () => {
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
      id: 'test-appointment-id-cl',
      insuredId: '12345CL',
      scheduleId: 2002,
      countryISO: 'CL',
    };
    const sqsRecord: SQSRecord = {
      messageId: 'mock-message-id-cl',
      receiptHandle: 'mock-receipt-handle-cl',
      body: JSON.stringify({ Message: JSON.stringify(mockRecordBody) }),
      attributes: {} as any,
      messageAttributes: {} as any,
      md5OfBody: 'mock-md5-cl',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:TestQueueCL',
      awsRegion: 'us-east-1',
    };
    mockSqsEvent = { Records: [sqsRecord] };
    process.env.EVENT_BUS_NAME = 'TestEventBus-cl-dev';
  });

  afterEach(() => {
    delete process.env.EVENT_BUS_NAME;
  });

  it('should process a valid SQS record, save to DB, and send EventBridge event for CL', async () => {
    const msgBody = JSON.parse(JSON.parse(mockSqsEvent.Records[0].body).Message);
    const savedAppointmentDetail = { id: 'db-detail-id-cl', ...msgBody };
    mockSaveAppointment.mockResolvedValue(savedAppointmentDetail);
    eventBridgeMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0, Entries: [{ EventId: 'evt-cl-123'}] });

    await handler(mockSqsEvent);

    expect(mockCreateApplicationContextHandler).toHaveBeenCalledWith(AppModule, expect.any(Object));
    expect(mockAppInit).toHaveBeenCalled();
    expect(mockAppGet).toHaveBeenCalledWith(DatabaseService);
    expect(mockSaveAppointment).toHaveBeenCalledWith(msgBody);
    expect(eventBridgeMock).toHaveReceivedCommandWith(PutEventsCommand, {
      Entries: [
        expect.objectContaining({
          EventBusName: 'TestEventBus-cl-dev',
          Source: 'appointment-service',
          DetailType: 'appointment.completed',
          Detail: JSON.stringify({
            id: 'test-appointment-id-cl',
            countryISO: 'CL',
            detail: {
              id: 'test-appointment-id-cl',
              appointmentDetail: savedAppointmentDetail,
            },
          }),
        }),
      ],
    });
  });

  it('should handle error if DatabaseService.saveAppointment fails for CL', async () => {
    const dbError = new Error('DB save failed CL');
    mockSaveAppointment.mockRejectedValue(dbError);
    await handler(mockSqsEvent);
    expect(eventBridgeMock.commandCalls(PutEventsCommand).length).toBe(0);
  });

  it('should handle error if EventBridgeClient.send fails for CL', async () => {
    const msgBody = JSON.parse(JSON.parse(mockSqsEvent.Records[0].body).Message);
    const savedAppointmentDetail = { id: 'db-detail-id-cl', ...msgBody };
    mockSaveAppointment.mockResolvedValue(savedAppointmentDetail);
    const ebError = new Error('EventBridge send failed CL');
    eventBridgeMock.on(PutEventsCommand).rejects(ebError);
    await handler(mockSqsEvent);
  });

  it('should handle JSON parsing error for record.body for CL', async () => {
    const malformedRecord: SQSRecord = { ...mockSqsEvent.Records[0], body: 'not-a-json-cl' };
    mockSqsEvent.Records = [malformedRecord];
    await handler(mockSqsEvent);
    expect(mockSaveAppointment).not.toHaveBeenCalled();
    expect(eventBridgeMock.commandCalls(PutEventsCommand).length).toBe(0);
  });

  it('should handle JSON parsing error for body.Message for CL', async () => {
    const malformedMessageRecord: SQSRecord = { ...mockSqsEvent.Records[0], body: JSON.stringify({ Message: 'still-not-json-cl' }) };
    mockSqsEvent.Records = [malformedMessageRecord];
    await handler(mockSqsEvent);
    expect(mockSaveAppointment).not.toHaveBeenCalled();
    expect(eventBridgeMock.commandCalls(PutEventsCommand).length).toBe(0);
  });

  it('should process multiple records in a single SQS event for CL', async () => {
    const recordBody1 = { id: 'rec1-cl', insuredId: 'insCL1', scheduleId: 301, countryISO: 'CL' };
    const recordBody2 = { id: 'rec2-cl', insuredId: 'insCL2', scheduleId: 302, countryISO: 'CL' };
    const sqsRecord1: SQSRecord = { ...mockSqsEvent.Records[0], body: JSON.stringify({ Message: JSON.stringify(recordBody1) }) };
    const sqsRecord2: SQSRecord = { ...mockSqsEvent.Records[0], messageId: 'msg2-cl', body: JSON.stringify({ Message: JSON.stringify(recordBody2) }) };
    mockSqsEvent.Records = [sqsRecord1, sqsRecord2];
    const { id: ignoredId1, ...restOfRecordBody1 } = recordBody1;
    const { id: ignoredId2, ...restOfRecordBody2 } = recordBody2;
    mockSaveAppointment
        .mockResolvedValueOnce({ id: 'db-detail-rec1-cl', ...restOfRecordBody1, status: 'completed', createdAt: new Date(), updatedAt: new Date() })
        .mockResolvedValueOnce({ id: 'db-detail-rec2-cl', ...restOfRecordBody2, status: 'completed', createdAt: new Date(), updatedAt: new Date() });
    eventBridgeMock.on(PutEventsCommand).resolves({});
    await handler(mockSqsEvent);
    expect(mockSaveAppointment).toHaveBeenCalledTimes(2);
    expect(mockSaveAppointment).toHaveBeenCalledWith(recordBody1);
    expect(mockSaveAppointment).toHaveBeenCalledWith(recordBody2);
    expect(eventBridgeMock.commandCalls(PutEventsCommand).length).toBe(2);
  });

  describe('Memoization of Nest App Context for CL', () => {
    let freshHandlerCL: (event: SQSEvent) => Promise<void>;

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
      
      const handlerModule = await import('./appointment-cl');
      freshHandlerCL = handlerModule.handler;
      
      const mockRecordBodyMemoCL = { id: 'memo-cl-id', insuredId: 'memoInsCL', scheduleId: 4001, countryISO: 'CL' };
      const sqsRecordMemoCL: SQSRecord = {
         messageId: 'memo-msg-id-cl', receiptHandle: 'memo-receipt-handle-cl',
         body: JSON.stringify({ Message: JSON.stringify(mockRecordBodyMemoCL) }),
         attributes: {} as any, messageAttributes: {} as any, md5OfBody: 'memo-md5-cl',
         eventSource: 'aws:sqs', eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:TestQueueMemoCL', awsRegion: 'us-east-1',
       };
      (mockSqsEvent as any) = { Records: [sqsRecordMemoCL] }; 
      process.env.EVENT_BUS_NAME = 'TestEventBus-Memo-cl-dev'; 
    });

    afterEach(() => {
      delete process.env.EVENT_BUS_NAME;
    });

    it('should initialize Nest app context only once for multiple calls for CL', async () => {
      const msgBodyMemoCL = JSON.parse(JSON.parse(mockSqsEvent.Records[0].body).Message);
      mockSaveAppointment.mockResolvedValue({ id: 'detail-mem-cl-1', ...msgBodyMemoCL, status: 'completed', createdAt: new Date(), updatedAt: new Date() });
      eventBridgeMock.on(PutEventsCommand).resolves({});

      await freshHandlerCL(mockSqsEvent); 
      await freshHandlerCL(mockSqsEvent); 

      expect(mockCreateApplicationContextHandler).toHaveBeenCalledTimes(1);
      expect(mockAppInit).toHaveBeenCalledTimes(1);
      expect(mockSaveAppointment).toHaveBeenCalledTimes(2); 
      expect(mockAppGet).toHaveBeenCalledWith(expect.objectContaining({ name: 'DatabaseService' }));
    });
  });
}); 