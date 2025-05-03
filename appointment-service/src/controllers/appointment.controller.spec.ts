import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from '../services/appointment.service';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { Appointment, AppointmentStatus } from '../models/appointment.model';
import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

type MockRequest = Partial<Request>;

describe('AppointmentController', () => {
  let controller: AppointmentController;
  let service: AppointmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentController],
      providers: [
        {
          provide: AppointmentService,
          useValue: {
            createAppointment: jest.fn(),
            getAppointmentsByInsuredId: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AppointmentController>(AppointmentController);
    service = module.get<AppointmentService>(AppointmentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createAppointment', () => {
    it('should create a new appointment', async () => {
      const dto: CreateAppointmentDto = {
        insuredId: '12345',
        scheduleId: 100,
        countryISO: 'PE',
      };

      const mockRequest: MockRequest = {
        body: dto,
        query: {},
      };

      const appointment: Appointment = {
        id: 'test-id',
        insuredId: dto.insuredId,
        scheduleId: dto.scheduleId,
        countryISO: dto.countryISO,
        status: AppointmentStatus.PENDING,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      };

      jest.spyOn(service, 'createAppointment').mockResolvedValue(appointment);

      const result = await controller.createAppointment(
        mockRequest as Request,
        dto.countryISO,
      );

      expect(service.createAppointment).toHaveBeenCalledWith(dto);
      expect(result).toEqual(appointment);
    });
  });

  describe('getAppointmentsByInsuredId', () => {
    it('should return appointments for a valid insured ID', async () => {
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

      jest.spyOn(service, 'getAppointmentsByInsuredId').mockResolvedValue(appointments);

      const result = await controller.getAppointmentsByInsuredId(insuredId);

      expect(service.getAppointmentsByInsuredId).toHaveBeenCalledWith(insuredId);
      expect(result).toEqual(appointments);
    });

    it('should throw BadRequestException for invalid insured ID', async () => {
      const invalidInsuredId = '123';

      await expect(
        controller.getAppointmentsByInsuredId(invalidInsuredId),
      ).rejects.toThrow(BadRequestException);

      expect(service.getAppointmentsByInsuredId).not.toHaveBeenCalled();
    });
  });
}); 