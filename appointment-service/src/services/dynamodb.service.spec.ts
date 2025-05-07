import { Test, TestingModule } from '@nestjs/testing';
import { DynamoDBService } from './dynamodb.service';
import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { Appointment, AppointmentStatus } from '../models/appointment.model';
import { v4 as uuidv4 } from 'uuid';

process.env.DYNAMODB_TABLE_NAME = 'TestAppointmentTable';

let currentMockUuid = 'default-mock-uuid';
jest.mock('uuid', () => ({
  ...jest.requireActual('uuid'),
  v4: () => currentMockUuid,
}));

describe('DynamoDBService', () => {
  let service: DynamoDBService;
  let ddbMock;

  beforeAll(() => {
    ddbMock = mockClient(DynamoDBClient);
  });

  beforeEach(async () => {
    ddbMock.reset();
    currentMockUuid = 'default-mock-uuid'; 

    const module: TestingModule = await Test.createTestingModule({
      providers: [DynamoDBService],
    }).compile();

    service = module.get<DynamoDBService>(DynamoDBService);
  });

  afterAll(() => {
    ddbMock.restore();
    jest.unmock('uuid');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveAppointment', () => {
    it('should save an appointment and return it with a generated id and timestamps if not provided', async () => {
      const appointmentInput: Partial<Appointment> = {
        insuredId: '12345',
        scheduleId: 1,
        countryISO: 'PE',
      };
      const expectedId = 'test-specific-uuid-for-save';
      currentMockUuid = expectedId;
      
      ddbMock.on(PutItemCommand).resolves({});

      const result = await service.saveAppointment(appointmentInput as Appointment);

      expect(result.id).toEqual(expectedId);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.status).toEqual(AppointmentStatus.PENDING);
      expect(result.insuredId).toEqual(appointmentInput.insuredId);
      expect(ddbMock).toHaveReceivedCommandWith(PutItemCommand, {
        TableName: 'TestAppointmentTable',
        Item: expect.objectContaining({
          id: { S: expectedId },
          insuredId: { S: appointmentInput.insuredId },
          countryISO: { S: appointmentInput.countryISO },
          status: { S: AppointmentStatus.PENDING }
        }),
      });
    });

    it('should use existing id and createdAt if provided, and update updatedAt', async () => {
      const existingId = 'existing-id-123';
      const existingCreatedAt = new Date(Date.now() - 100000).toISOString();
      const appointmentInput: Appointment = {
        id: existingId,
        insuredId: '67890',
        scheduleId: 2,
        countryISO: 'CL',
        status: AppointmentStatus.COMPLETED,
        createdAt: existingCreatedAt,
        updatedAt: existingCreatedAt,
      };
      
      ddbMock.on(PutItemCommand).resolves({});

      const result = await service.saveAppointment(appointmentInput);

      expect(result.id).toEqual(existingId);
      expect(result.createdAt).toEqual(existingCreatedAt);
      expect(result.updatedAt).not.toEqual(existingCreatedAt);
      expect(result.status).toEqual(AppointmentStatus.COMPLETED);
      expect(ddbMock).toHaveReceivedCommandWith(PutItemCommand, {
        Item: expect.objectContaining({
          id: { S: existingId },
          createdAt: { S: existingCreatedAt },
          status: { S: AppointmentStatus.COMPLETED }
        }),
      });
    });

    it('should throw an error if DynamoDB PutItemCommand fails', async () => {
      const appointmentInput: Partial<Appointment> = { insuredId: '12345', scheduleId: 1, countryISO: 'PE' };
      ddbMock.on(PutItemCommand).rejects(new Error('DynamoDB error'));
      await expect(service.saveAppointment(appointmentInput as Appointment)).rejects.toThrow('DynamoDB error');
    });
  });

  describe('getAppointmentsByInsuredId', () => {
    it('should return an array of appointments if found', async () => {
      const insuredId = 'test-insured-id';
      const mockItems = [
        { id: { S: uuidv4() }, insuredId: { S: insuredId }, scheduleId: { N: '1' }, countryISO: { S: 'PE' }, status: { S: AppointmentStatus.PENDING }, createdAt: { S: new Date().toISOString() }, updatedAt: { S: new Date().toISOString() } },
        { id: { S: uuidv4() }, insuredId: { S: insuredId }, scheduleId: { N: '2' }, countryISO: { S: 'CL' }, status: { S: AppointmentStatus.COMPLETED }, createdAt: { S: new Date().toISOString() }, updatedAt: { S: new Date().toISOString() } },
      ];
      ddbMock.on(QueryCommand).resolves({ Items: mockItems });

      const result = await service.getAppointmentsByInsuredId(insuredId);

      expect(result.length).toBe(2);
      expect(result[0].insuredId).toEqual(insuredId);
      expect(result[1].status).toEqual(AppointmentStatus.COMPLETED);
      expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
        TableName: 'TestAppointmentTable',
        IndexName: 'InsuredIdIndex',
        KeyConditionExpression: 'insuredId = :insuredId',
        ExpressionAttributeValues: {
          ':insuredId': { S: insuredId },
        },
      });
    });

    it('should return an empty array if no appointments are found', async () => {
      const insuredId = 'not-found-id';
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const result = await service.getAppointmentsByInsuredId(insuredId);
      expect(result).toEqual([]);
    });

    it('should return an empty array if response.Items is undefined', async () => {
      const insuredId = 'undefined-items-id';
      ddbMock.on(QueryCommand).resolves({});
      const result = await service.getAppointmentsByInsuredId(insuredId);
      expect(result).toEqual([]);
    });

    it('should throw an error if DynamoDB QueryCommand fails', async () => {
      const insuredId = 'error-id';
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB query error'));
      await expect(service.getAppointmentsByInsuredId(insuredId)).rejects.toThrow('DynamoDB query error');
    });
  });

  describe('updateAppointmentStatus', () => {
    it('should update appointment status and return the updated appointment', async () => {
      const appointmentId = uuidv4();
      const newStatus = AppointmentStatus.COMPLETED;
      const mockUpdatedAttributes = {
        id: { S: appointmentId }, 
        insuredId: { S: 'original-insured' }, 
        scheduleId: { N: '100' }, 
        countryISO: { S: 'PE' }, 
        status: { S: newStatus }, 
        createdAt: { S: new Date().toISOString() }, 
        updatedAt: { S: new Date().toISOString() }
      };
      ddbMock.on(UpdateItemCommand).resolves({ Attributes: mockUpdatedAttributes });

      const result = await service.updateAppointmentStatus(appointmentId, newStatus);

      expect(result.id).toEqual(appointmentId);
      expect(result.status).toEqual(newStatus);
      expect(result.updatedAt).toEqual(expect.any(String));
      expect(ddbMock).toHaveReceivedCommandWith(UpdateItemCommand, {
        TableName: 'TestAppointmentTable',
        Key: { id: { S: appointmentId } },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':status': { S: newStatus },
          ':updatedAt': { S: expect.any(String) },
        },
        ReturnValues: 'ALL_NEW',
      });
    });

    it('should throw an error if UpdateItemCommand fails', async () => {
      const appointmentId = uuidv4();
      ddbMock.on(UpdateItemCommand).rejects(new Error('DynamoDB update error'));
      await expect(service.updateAppointmentStatus(appointmentId, AppointmentStatus.COMPLETED)).rejects.toThrow('DynamoDB update error');
    });

    it('should throw an error if appointment to update is not found (no attributes returned)', async () => {
      const appointmentId = 'non-existent-id';
      ddbMock.on(UpdateItemCommand).resolves({ Attributes: undefined });
      await expect(service.updateAppointmentStatus(appointmentId, AppointmentStatus.COMPLETED)).rejects.toThrow(
        `Appointment with id ${appointmentId} not found`
      );
    });
  });
}); 