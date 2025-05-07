import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentService } from './appointment.service';
import { DynamoDBService } from './dynamodb.service';
import { SNSService } from './sns.service';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { Appointment, AppointmentStatus } from '../models/appointment.model';
import { Logger } from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid-12345'),
}));


const mockDynamoDBService = {
  saveAppointment: jest.fn(),
  getAppointmentsByInsuredId: jest.fn(),
  updateAppointmentStatus: jest.fn(),
};

const mockSNSService = {
  publishAppointment: jest.fn(),
};

describe('AppointmentService', () => {
  let service: AppointmentService;
  let dynamoDBService: DynamoDBService;
  let snsService: SNSService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: DynamoDBService, useValue: mockDynamoDBService },
        { provide: SNSService, useValue: mockSNSService },
        
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);
    dynamoDBService = module.get<DynamoDBService>(DynamoDBService);
    snsService = module.get<SNSService>(SNSService);

    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAppointment', () => {
    it('should create, save to DynamoDB, and publish to SNS', async () => {
      const createDto: CreateAppointmentDto = {
        insuredId: '12345',
        scheduleId: 101,
        countryISO: 'PE',
      };

      const expectedAppointmentBase: Partial<Appointment> = {
        insuredId: createDto.insuredId,
        scheduleId: createDto.scheduleId,
        countryISO: createDto.countryISO,
        status: AppointmentStatus.PENDING,
        id: 'mocked-uuid-12345',
      };
      
      
      const savedAppointment: Appointment = {
        ...expectedAppointmentBase,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Appointment;

      mockDynamoDBService.saveAppointment.mockResolvedValue(savedAppointment);
      mockSNSService.publishAppointment.mockResolvedValue(undefined);

      const result = await service.createAppointment(createDto);

      expect(mockDynamoDBService.saveAppointment).toHaveBeenCalledTimes(1);
      expect(mockDynamoDBService.saveAppointment).toHaveBeenCalledWith(
        expect.objectContaining(expectedAppointmentBase),
      );
      
      expect(mockSNSService.publishAppointment).toHaveBeenCalledTimes(1);
      expect(mockSNSService.publishAppointment).toHaveBeenCalledWith(savedAppointment);

      expect(result).toEqual(savedAppointment);
    });

    it('should throw an error if DynamoDBService fails', async () => {
      const createDto: CreateAppointmentDto = {
        insuredId: '12345',
        scheduleId: 101,
        countryISO: 'PE',
      };
      const dbError = new Error('DynamoDB save failed');
      mockDynamoDBService.saveAppointment.mockRejectedValue(dbError);

      await expect(service.createAppointment(createDto)).rejects.toThrow(dbError);
      expect(mockSNSService.publishAppointment).not.toHaveBeenCalled();
    });

    it('should throw an error if SNSService fails', async () => {
      const createDto: CreateAppointmentDto = {
        insuredId: '12345',
        scheduleId: 101,
        countryISO: 'PE',
      };
       const savedAppointment: Appointment = {
        id: 'mocked-uuid-12345',
        insuredId: createDto.insuredId,
        scheduleId: createDto.scheduleId,
        countryISO: createDto.countryISO,
        status: AppointmentStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const snsError = new Error('SNS publish failed');
      mockDynamoDBService.saveAppointment.mockResolvedValue(savedAppointment);
      mockSNSService.publishAppointment.mockRejectedValue(snsError);

      await expect(service.createAppointment(createDto)).rejects.toThrow(snsError);
      expect(mockDynamoDBService.saveAppointment).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAppointmentsByInsuredId', () => {
    it('should call DynamoDBService and return its result', async () => {
      const insuredId = 'test-insured-id';
      const mockAppointments: Appointment[] = [
        { id: 'appt1', insuredId, scheduleId: 1, countryISO: 'PE', status: AppointmentStatus.COMPLETED, createdAt: '', updatedAt: '' },
      ];
      mockDynamoDBService.getAppointmentsByInsuredId.mockResolvedValue(mockAppointments);

      const result = await service.getAppointmentsByInsuredId(insuredId);

      expect(mockDynamoDBService.getAppointmentsByInsuredId).toHaveBeenCalledTimes(1);
      expect(mockDynamoDBService.getAppointmentsByInsuredId).toHaveBeenCalledWith(insuredId);
      expect(result).toEqual(mockAppointments);
    });
  });

  describe('updateAppointmentStatus', () => {
    it('should call DynamoDBService and return its result', async () => {
      const appointmentId = 'appt-to-update';
      const newStatus = AppointmentStatus.COMPLETED;
      const mockUpdatedAppointment: Appointment = {
        id: appointmentId, 
        insuredId: 'insured1', 
        scheduleId: 1, 
        countryISO: 'CL', 
        status: newStatus, 
        createdAt: '', 
        updatedAt: new Date().toISOString(),
      };
      mockDynamoDBService.updateAppointmentStatus.mockResolvedValue(mockUpdatedAppointment);

      const result = await service.updateAppointmentStatus(appointmentId, newStatus);

      expect(mockDynamoDBService.updateAppointmentStatus).toHaveBeenCalledTimes(1);
      expect(mockDynamoDBService.updateAppointmentStatus).toHaveBeenCalledWith(appointmentId, newStatus);
      expect(result).toEqual(mockUpdatedAppointment);
    });
  });
}); 