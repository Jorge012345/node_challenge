import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from '../services/appointment.service';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { Appointment, AppointmentStatus } from '../models/appointment.model';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

type MockRequest = Partial<Request>;

const mockAppointmentService = {
  createAppointment: jest.fn(),
  getAppointmentsByInsuredId: jest.fn(),
};

describe('AppointmentController', () => {
  let controller: AppointmentController;
  let service: AppointmentService;

  
  const validDto: CreateAppointmentDto = {
    insuredId: '12345',
    scheduleId: 101,
    countryISO: 'PE',
  };
  const mockAppointment: Appointment = {
    id: 'mock-id',
    ...validDto,
    status: AppointmentStatus.PENDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const mockRequestBase: Partial<Request> = {
    query: {},
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentController],
      providers: [
        { provide: AppointmentService, useValue: mockAppointmentService },
      ],
    }).compile();

    controller = module.get<AppointmentController>(AppointmentController);
    service = module.get<AppointmentService>(AppointmentService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createAppointment', () => {
    it('should create appointment successfully when body is a valid JSON Buffer', async () => {
      const mockReq = {
        ...mockRequestBase,
        body: Buffer.from(JSON.stringify(validDto)),
      } as Request;
      mockAppointmentService.createAppointment.mockResolvedValue(mockAppointment);

      const result = await controller.createAppointment(mockReq);
      
      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(expect.objectContaining(validDto));
      expect(result).toEqual(mockAppointment);
    });

    it('should create appointment successfully when body is a valid JSON string', async () => {
      const mockReq = {
        ...mockRequestBase,
        body: JSON.stringify(validDto),
      } as Request;
      mockAppointmentService.createAppointment.mockResolvedValue(mockAppointment);

      const result = await controller.createAppointment(mockReq);
      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(expect.objectContaining(validDto));
      expect(result).toEqual(mockAppointment);
    });
    
    it('should create appointment successfully when body is already a parsed object', async () => {
      const mockReq = {
        ...mockRequestBase,
        body: { ...validDto },
      } as Request;
      mockAppointmentService.createAppointment.mockResolvedValue(mockAppointment);

      const result = await controller.createAppointment(mockReq);
      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(expect.objectContaining(validDto));
      expect(result).toEqual(mockAppointment);
    });

    it('should create appointment successfully when body is a serialized Buffer object', async () => {
      const mockReq = {
        ...mockRequestBase,
        body: { type: 'Buffer', data: Array.from(Buffer.from(JSON.stringify(validDto))) },
      } as Request;
      mockAppointmentService.createAppointment.mockResolvedValue(mockAppointment);

      const result = await controller.createAppointment(mockReq);
      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(expect.objectContaining(validDto));
      expect(result).toEqual(mockAppointment);
    });

    it('should throw BadRequestException if body is an invalid JSON Buffer', async () => {
      const mockReq = {
        ...mockRequestBase,
        body: Buffer.from('not-a-json'),
      } as Request;
      
      await expect(controller.createAppointment(mockReq)).rejects.toThrow(
        new BadRequestException('Invalid JSON body format'),
      );
    });

    it('should throw BadRequestException if DTO validation fails (e.g., insuredId too short)', async () => {
      const invalidPayload = { ...validDto, insuredId: '123' };
      const mockReq = {
        ...mockRequestBase,
        body: Buffer.from(JSON.stringify(invalidPayload)),
      } as Request;
      await expect(controller.createAppointment(mockReq)).rejects.toThrow(BadRequestException);
    });

    it('should set countryISO from query param if not in body (PE) and pass validation', async () => {
      const dtoInBodyWithPE = { insuredId: '12345', scheduleId: 101, countryISO: 'PE' };
      const expectedDtoAfterLogic = { ...dtoInBodyWithPE };
      const mockReq = {
        ...mockRequestBase,
        body: Buffer.from(JSON.stringify(dtoInBodyWithPE)),
      } as Request;
      mockAppointmentService.createAppointment.mockResolvedValue(mockAppointment);
      
      await controller.createAppointment(mockReq, 'PE');
      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining(expectedDtoAfterLogic)
      );
    });

    it('should set countryISO from query param if not in body (CL) and pass validation', async () => {
      const dtoInBodyWithCL = { insuredId: '12345', scheduleId: 101, countryISO: 'CL' };
      const expectedDtoAfterLogic = { ...dtoInBodyWithCL };
      const mockAppointmentCL: Appointment = { ...mockAppointment, countryISO: 'CL' }; 
      const mockReq = {
        ...mockRequestBase,
        body: Buffer.from(JSON.stringify(dtoInBodyWithCL)),
      } as Request;
      mockAppointmentService.createAppointment.mockResolvedValue(mockAppointmentCL);
      
      await controller.createAppointment(mockReq, 'CL');
      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining(expectedDtoAfterLogic)
      );
    });
    
    it('should default to PE if countryISO not in body and no query param, and pass validation', async () => {
      const dtoInBodyWithPE = { insuredId: '12345', scheduleId: 101, countryISO: 'PE' };
      const expectedDtoAfterLogic = { ...dtoInBodyWithPE };
      const mockReq = {
        ...mockRequestBase,
        body: Buffer.from(JSON.stringify(dtoInBodyWithPE)),
      } as Request;
      mockAppointmentService.createAppointment.mockResolvedValue(mockAppointment);
      
      await controller.createAppointment(mockReq);
      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining(expectedDtoAfterLogic)
      );
    });

    it('should throw BadRequestException if final countryISO after logic is invalid (e.g. AR)', async () => {
      const dtoWithInvalidCountryInBody = { ...validDto, countryISO: 'AR' }; 
      const mockReq = {
        ...mockRequestBase,
        body: Buffer.from(JSON.stringify(dtoWithInvalidCountryInBody)),
      } as Request;

      await expect(controller.createAppointment(mockReq)).rejects.toThrow(BadRequestException);
    });

    it('should re-throw BadRequestException from service', async () => {
      const mockReq = {
        ...mockRequestBase,
        body: Buffer.from(JSON.stringify(validDto)),
      } as Request;
      const serviceError = new BadRequestException('Service specific error');
      mockAppointmentService.createAppointment.mockRejectedValue(serviceError);

      await expect(controller.createAppointment(mockReq)).rejects.toThrow(serviceError);
    });
    
    it('should handle generic service errors by logging and throwing some exception', async () => {
        const mockReq = {
            ...mockRequestBase,
            body: Buffer.from(JSON.stringify(validDto)),
        } as Request;
        const serviceError = new Error('Some internal service error');
        mockAppointmentService.createAppointment.mockRejectedValue(serviceError);

        await expect(controller.createAppointment(mockReq)).rejects.toThrow();
    });
  });

  describe('getAppointmentsByInsuredId', () => {
    it('should return appointments for a valid insuredId', async () => {
      const insuredId = '12345';
      const mockAppointmentsResult: Appointment[] = [{ ...mockAppointment, insuredId }];
      mockAppointmentService.getAppointmentsByInsuredId.mockResolvedValue(mockAppointmentsResult);

      const result = await controller.getAppointmentsByInsuredId(insuredId);
      expect(mockAppointmentService.getAppointmentsByInsuredId).toHaveBeenCalledWith(insuredId);
      expect(result).toEqual(mockAppointmentsResult);
    });

    it('should throw BadRequestException for an invalid insuredId (too short)', async () => {
      const insuredId = '123';
      await expect(controller.getAppointmentsByInsuredId(insuredId)).rejects.toThrow(
        new BadRequestException('El ID del asegurado debe tener 5 dígitos'),
      );
    });
    
    it('should throw BadRequestException for an invalid insuredId (non-digits)', async () => {
      const insuredId = 'abcde';
      await expect(controller.getAppointmentsByInsuredId(insuredId)).rejects.toThrow(
        new BadRequestException('El ID del asegurado debe tener 5 dígitos'),
      );
    });
  });
}); 