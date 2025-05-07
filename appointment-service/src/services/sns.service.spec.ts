import { Test, TestingModule } from '@nestjs/testing';
import { SNSService } from './sns.service';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { Appointment, AppointmentStatus } from '../models/appointment.model';


process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:TestTopic-dev';

describe('SNSService', () => {
  let service: SNSService;
  let snsMock;

  beforeAll(() => {
    snsMock = mockClient(SNSClient);
  });

  beforeEach(async () => {
    snsMock.reset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SNSService],
    }).compile();

    service = module.get<SNSService>(SNSService);
  });

  afterAll(() => {
    snsMock.restore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publishAppointment', () => {
    const mockAppointment: Appointment = {
      id: 'test-id-123',
      insuredId: '12345',
      scheduleId: 101,
      countryISO: 'PE',
      status: AppointmentStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should publish an appointment to SNS successfully', async () => {
      snsMock.on(PublishCommand).resolves({ MessageId: 'mock-message-id' });

      await service.publishAppointment(mockAppointment);

      expect(snsMock).toHaveReceivedCommandWith(PublishCommand, {
        TopicArn: 'arn:aws:sns:us-east-1:123456789012:TestTopic-dev',
        Message: JSON.stringify(mockAppointment),
        MessageAttributes: {
          countryISO: {
            DataType: 'String',
            StringValue: 'PE',
          },
        },
      });
    });

    it('should use the countryISO from the appointment for MessageAttributes', async () => {
      const mockAppointmentCL: Appointment = { ...mockAppointment, countryISO: 'CL' };
      snsMock.on(PublishCommand).resolves({ MessageId: 'mock-message-id-cl' });

      await service.publishAppointment(mockAppointmentCL);

      expect(snsMock).toHaveReceivedCommandWith(PublishCommand, {
        MessageAttributes: {
          countryISO: {
            DataType: 'String',
            StringValue: 'CL',
          },
        },
      });
    });

    it('should throw an error if SNS PublishCommand fails', async () => {
      snsMock.on(PublishCommand).rejects(new Error('SNS publish error'));

      await expect(service.publishAppointment(mockAppointment)).rejects.toThrow('SNS publish error');
    });

    it('should log success message with MessageId', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');
      snsMock.on(PublishCommand).resolves({ MessageId: 'specific-message-id' });

      await service.publishAppointment(mockAppointment);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Successfully published to SNS with MessageId: specific-message-id',
      );
      loggerSpy.mockRestore();
    });

    it('should log error message if publishing fails', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      const error = new Error('SNS publish error');
      snsMock.on(PublishCommand).rejects(error);

      await expect(service.publishAppointment(mockAppointment)).rejects.toThrow(error);

      expect(loggerSpy).toHaveBeenCalledWith(
        `Error publishing to SNS: ${error.message}`,
        error.stack,
      );
      loggerSpy.mockRestore();
    });
  });
}); 