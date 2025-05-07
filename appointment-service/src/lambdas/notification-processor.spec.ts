import { SQSEvent, SQSRecord } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { AppointmentStatus } from '../models/appointment.model';
import { Logger } from '@nestjs/common';

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

describe('NotificationProcessorHandler', () => {
  let mockSqsEvent: SQSEvent;
  const testTableName = 'TestNotificationsTable';
  let originalDynamoTableName: string | undefined;
  let handler: (event: SQSEvent) => Promise<void>;
  let ddbMock: any;
  let UpdateItemCommandFromSDK: any;

  beforeEach(async () => {
    originalDynamoTableName = process.env.DYNAMODB_TABLE_NAME;
    process.env.DYNAMODB_TABLE_NAME = testTableName;
    console.log(`[SPEC beforeEach] process.env.DYNAMODB_TABLE_NAME set to: ${process.env.DYNAMODB_TABLE_NAME}`);

    jest.resetModules();
    console.log('[SPEC beforeEach] jest.resetModules() called.');
    const sdk = await import('@aws-sdk/client-dynamodb');
    UpdateItemCommandFromSDK = sdk.UpdateItemCommand;
    ddbMock = mockClient(sdk.DynamoDBClient);

    const handlerModule = await import('./notification-processor');
    handler = handlerModule.handler;
    console.log('[SPEC beforeEach] Handler imported.');
    if(ddbMock) ddbMock.reset(); 

    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalDynamoTableName === undefined) {
      delete process.env.DYNAMODB_TABLE_NAME;
    } else {
      process.env.DYNAMODB_TABLE_NAME = originalDynamoTableName;
    }
  });

  const createMockSqsRecord = (bodyContent: any): SQSRecord => ({
    messageId: 'mock-msg-id',
    receiptHandle: 'mock-receipt-handle',
    body: JSON.stringify(bodyContent),
    attributes: {} as any,
    messageAttributes: {} as any,
    md5OfBody: 'mock-md5',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:TestNotificationQueue',
    awsRegion: 'us-east-1',
  });
  describe('Appointment ID extraction', () => {
    const testCases = [
      { description: 'body.detail.id', body: { detail: { id: 'id-from-detail' } }, expectedId: 'id-from-detail' },
      { 
        description: 'body.detail.detail.id (nested detail)',
        body: { detail: { detail: { id: 'id-from-nested-detail' } } }, 
        expectedId: 'id-from-nested-detail' 
      },
      { description: 'body.id', body: { id: 'id-from-body' }, expectedId: 'id-from-body' },
    ];

    testCases.forEach(({ description, body, expectedId }) => {
      it(`should extract appointmentId from ${description}`, async () => {
        mockSqsEvent = { Records: [createMockSqsRecord(body)] };
        ddbMock.on(UpdateItemCommandFromSDK).resolves({ Attributes: { id: { S: expectedId } } });

        await handler(mockSqsEvent);

        expect(ddbMock).toHaveReceivedCommandWith(UpdateItemCommandFromSDK, {
          TableName: testTableName,
          Key: { id: { S: expectedId } },
          UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': { S: AppointmentStatus.COMPLETED },
            ':updatedAt': { S: expect.any(String) },
          },
          ReturnValues: 'ALL_NEW',
        });
      });
    });

    it('should throw/log error if appointmentId cannot be found', async () => {
      const invalidBody = { detail: { someOtherField: 'no-id-here' } };
      mockSqsEvent = { Records: [createMockSqsRecord(invalidBody)] };
      await handler(mockSqsEvent);
      expect(ddbMock.commandCalls(UpdateItemCommandFromSDK).length).toBe(0);
    });
  });

  it('should log success if DynamoDB update returns attributes', async () => {
    const body = { detail: { id: 'id-for-success-log' } };
    mockSqsEvent = { Records: [createMockSqsRecord(body)] };
    ddbMock.on(UpdateItemCommandFromSDK).resolves({ 
      Attributes: { 
        id: { S: 'id-for-success-log' }, 
        status: { S: AppointmentStatus.COMPLETED }
      } 
    });

    await handler(mockSqsEvent);
  });

  it('should log warning if DynamoDB update does not return attributes (item not found)', async () => {
    const body = { detail: { id: 'id-for-warning-log' } };
    mockSqsEvent = { Records: [createMockSqsRecord(body)] };
    ddbMock.on(UpdateItemCommandFromSDK).resolves({ Attributes: undefined });

    await handler(mockSqsEvent);
  });

  it('should handle error if DynamoDBClient.send fails', async () => {
    const body = { detail: { id: 'id-for-ddb-fail' } };
    mockSqsEvent = { Records: [createMockSqsRecord(body)] };
    const ddbError = new Error('DynamoDB send failed');
    ddbMock.on(UpdateItemCommandFromSDK).rejects(ddbError);

    await handler(mockSqsEvent);
  });

  it('should handle JSON parsing error for record.body', async () => {
    const malformedRecord: SQSRecord = { 
      ...createMockSqsRecord({}),
      body: 'this-is-not-json' 
    };
    mockSqsEvent = { Records: [malformedRecord] };

    await handler(mockSqsEvent);
    expect(ddbMock.commandCalls(UpdateItemCommandFromSDK).length).toBe(0);
  });

  it('should process multiple valid records in a single SQS event', async () => {
    const record1Body = { detail: { id: 'multi-id-1' } };
    const record2Body = { id: 'multi-id-2' }; 
    mockSqsEvent = { 
      Records: [
        createMockSqsRecord(record1Body),
        createMockSqsRecord(record2Body),
      ]
    };
    ddbMock.on(UpdateItemCommandFromSDK).resolves({ Attributes: { id: { S: 'some-id'} } });
    await handler(mockSqsEvent);
    expect(ddbMock.commandCalls(UpdateItemCommandFromSDK).length).toBe(2);

    const expectedCommandPayloadBase = {
      TableName: testTableName,
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': { S: AppointmentStatus.COMPLETED },
        ':updatedAt': { S: expect.any(String) },
      },
      ReturnValues: 'ALL_NEW',
    };

    expect(ddbMock).toHaveReceivedNthCommandWith(1, UpdateItemCommandFromSDK, {
      ...expectedCommandPayloadBase,
      Key: { id: { S: 'multi-id-1' } },
    });
    expect(ddbMock).toHaveReceivedNthCommandWith(2, UpdateItemCommandFromSDK, {
      ...expectedCommandPayloadBase,
      Key: { id: { S: 'multi-id-2' } },
    });
  });
}); 