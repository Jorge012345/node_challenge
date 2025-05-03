import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentService } from './appointment.service';
import { DynamoDBService } from './dynamodb.service';
import { SNSService } from './sns.service';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { Appointment, AppointmentStatus } from '../models/appointment.model';

describe('AppointmentService', () => {
  let service: AppointmentService;
  let dynamoDBService: DynamoDBService;
  let snsService: SNSService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        {
          provide: DynamoDBService,
          useValue: {
            saveAppointment: jest.fn(),
            getAppointmentsByInsuredId: jest.fn(),
            updateAppointmentStatus: jest.fn(),
          },
        },
        {
          provide: SNSService,
          useValue: {
            publishAppointment: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);
    dynamoDBService = module.get<DynamoDBService>(DynamoDBService);
    snsService = module.get<SNSService>(SNSService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAppointment', () => {
    it('should create an appointment and publish to SNS', async () => {
      const dto: CreateAppointmentDto = {
        insuredId: '12345',
        scheduleId: 100,
        countryISO: 'PE',
      };

      const savedAppointment: Appointment = {
        id: 'test-id',
        insuredId: dto.insuredId,
        scheduleId: dto.scheduleId,
        countryISO: dto.countryISO,
        status: AppointmentStatus.PENDING,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      };

      jest.spyOn(dynamoDBService, 'saveAppointment').mockResolvedValue(savedAppointment);
      jest.spyOn(snsService, 'publishAppointment').mockResolvedValue();

      const result = await service.createAppointment(dto);

      expect(dynamoDBService.saveAppointment).toHaveBeenCalled();
      expect(snsService.publishAppointment).toHaveBeenCalledWith(savedAppointment);
      expect(result).toEqual(savedAppointment);
    });
  });

  describe('getAppointmentsByInsuredId', () => {
    it('should return appointments for an insured', async () => {
      const insuredId = '12345';
      const appointments: Appointment[] = [
        {
          id: 'test-id',
          insuredId,
          scheduleId: 100,
          countryISO: 'PE',
          status: AppointmentStatus.PENDING,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z',
        },
      ];

      jest.spyOn(dynamoDBService, 'getAppointmentsByInsuredId').mockResolvedValue(appointments);

      const result = await service.getAppointmentsByInsuredId(insuredId);

      expect(dynamoDBService.getAppointmentsByInsuredId).toHaveBeenCalledWith(insuredId);
      expect(result).toEqual(appointments);
    });
  });

  describe('updateAppointmentStatus', () => {
    it('should update appointment status', async () => {
      const id = 'test-id';
      const status = AppointmentStatus.COMPLETED;
      const appointment: Appointment = {
        id,
        insuredId: '12345',
        scheduleId: 100,
        countryISO: 'PE',
        status,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      };

      jest.spyOn(dynamoDBService, 'updateAppointmentStatus').mockResolvedValue(appointment);

      const result = await service.updateAppointmentStatus(id, status);

      expect(dynamoDBService.updateAppointmentStatus).toHaveBeenCalledWith(id, status);
      expect(result).toEqual(appointment);
    });
  });
}); 