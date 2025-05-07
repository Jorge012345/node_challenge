import { Test, TestingModule } from '@nestjs/testing';
import { SQSService } from './sqs.service';
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

describe('SQSService', () => {
  let service: SQSService;
  let sqsMock;

  const testQueueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789012/TestQueue';

  beforeAll(() => {
    sqsMock = mockClient(SQSClient);
  });

  beforeEach(async () => {
    sqsMock.reset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SQSService],
    }).compile();
    service = module.get<SQSService>(SQSService);
  });

  afterAll(() => {
    sqsMock.restore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage', () => {
    const testMessage = { data: 'test_payload', id: 'msg1' };

    it('should send a message to SQS successfully', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'mock-sqs-message-id' });

      await service.sendMessage(testQueueUrl, testMessage);

      expect(sqsMock).toHaveReceivedCommandWith(SendMessageCommand, {
        QueueUrl: testQueueUrl,
        MessageBody: JSON.stringify(testMessage),
      });
    });

    it('should throw an error if SQS SendMessageCommand fails', async () => {
      const errorMessage = 'SQS send error';
      sqsMock.on(SendMessageCommand).rejects(new Error(errorMessage));

      await expect(service.sendMessage(testQueueUrl, testMessage)).rejects.toThrow(errorMessage);
    });
  });

  describe('receiveMessage', () => {
    it('should receive a message from SQS if available', async () => {
      const mockMessage = { Body: JSON.stringify({ text: 'hello' }), ReceiptHandle: 'mock-receipt-handle', MessageId: 'sqs-msg-id' };
      sqsMock.on(ReceiveMessageCommand).resolves({ Messages: [mockMessage] });

      const result = await service.receiveMessage(testQueueUrl);

      expect(result).toEqual(mockMessage);
      expect(sqsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: testQueueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 5,
      });
    });

    it('should return null if no messages are available', async () => {
      sqsMock.on(ReceiveMessageCommand).resolves({ Messages: [] });
      const result = await service.receiveMessage(testQueueUrl);
      expect(result).toBeNull();
    });
    
    it('should return null if Messages property is undefined', async () => {
      sqsMock.on(ReceiveMessageCommand).resolves({});
      const result = await service.receiveMessage(testQueueUrl);
      expect(result).toBeNull();
    });

    it('should throw an error if SQS ReceiveMessageCommand fails', async () => {
      const errorMessage = 'SQS receive error';
      sqsMock.on(ReceiveMessageCommand).rejects(new Error(errorMessage));

      await expect(service.receiveMessage(testQueueUrl)).rejects.toThrow(errorMessage);
    });
  });

  describe('deleteMessage', () => {
    const testReceiptHandle = 'test-receipt-handle-123';

    it('should delete a message from SQS successfully', async () => {
      sqsMock.on(DeleteMessageCommand).resolves({});

      await service.deleteMessage(testQueueUrl, testReceiptHandle);

      expect(sqsMock).toHaveReceivedCommandWith(DeleteMessageCommand, {
        QueueUrl: testQueueUrl,
        ReceiptHandle: testReceiptHandle,
      });
    });

    it('should throw an error if SQS DeleteMessageCommand fails', async () => {
      const errorMessage = 'SQS delete error';
      sqsMock.on(DeleteMessageCommand).rejects(new Error(errorMessage));

      await expect(service.deleteMessage(testQueueUrl, testReceiptHandle)).rejects.toThrow(errorMessage);
    });
  });
}); 