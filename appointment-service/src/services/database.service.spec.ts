import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { DataSource } from 'typeorm';
import { Appointment, AppointmentStatus } from '../models/appointment.model';
import { AppointmentDetail } from '../models/appointment-detail.entity';

const mockDataSourceInitialize = jest.fn().mockResolvedValue(undefined);
const mockDataSourceDestroy = jest.fn().mockResolvedValue(undefined);
const mockRepositorySave = jest.fn();
const mockRepositoryCreate = jest.fn();
const mockGetRepository = jest.fn(() => ({
  save: mockRepositorySave,
  create: mockRepositoryCreate,
}));

jest.mock('typeorm', () => {
  const originalTypeOrm = jest.requireActual('typeorm');
  return {
    ...originalTypeOrm,
    DataSource: jest.fn().mockImplementation(() => ({
      initialize: mockDataSourceInitialize,
      destroy: mockDataSourceDestroy,
      isInitialized: true,
      getRepository: mockGetRepository,
    })),
  };
});

describe('DatabaseService', () => {
  let service: DatabaseService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize data sources if SHOULD_CONNECT_DB is true', async () => {
      process.env.SHOULD_CONNECT_DB = 'true';
      const newService = new DatabaseService(); 
      await newService.onModuleInit();
      expect(DataSource).toHaveBeenCalledTimes(2);
      expect(mockDataSourceInitialize).toHaveBeenCalledTimes(2);
    });

    it('should not initialize data sources if SHOULD_CONNECT_DB is not true', async () => {
      process.env.SHOULD_CONNECT_DB = 'false';
      const newService = new DatabaseService();
      await newService.onModuleInit();
      expect(DataSource).not.toHaveBeenCalled();
      expect(mockDataSourceInitialize).not.toHaveBeenCalled();
    });

    it('should log error and throw if dataSource initialization fails', async () => {
        process.env.SHOULD_CONNECT_DB = 'true';
        mockDataSourceInitialize.mockRejectedValueOnce(new Error('DB init error PE')).mockRejectedValueOnce(new Error('DB init error CL'));
        const newService = new DatabaseService();
        await expect(newService.onModuleInit()).rejects.toThrow('DB init error PE');
    });
  });

  describe('saveAppointment', () => {
    const mockAppointmentPE: Appointment = {
      id: 'app-pe-1',
      insuredId: '12345',
      scheduleId: 101,
      countryISO: 'PE',
      status: AppointmentStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockAppointmentCL: Appointment = { ...mockAppointmentPE, countryISO: 'CL', id: 'app-cl-1' };
    const mockSavedDetail: AppointmentDetail = { 
      id: '1', 
      insuredId: '12345', 
      scheduleId: 101, 
      countryISO: 'PE', 
      status: 'completed', 
      createdAt: new Date(), 
      updatedAt: new Date() 
    };

    beforeEach(() => {
      service.dataSourcePE = new (DataSource as any)({ entities: [AppointmentDetail] });
      service.dataSourceCL = new (DataSource as any)({ entities: [AppointmentDetail] });
      (service.dataSourcePE as any).isInitialized = true;
      (service.dataSourceCL as any).isInitialized = true;
      mockRepositoryCreate.mockReturnValue(mockSavedDetail);
      mockRepositorySave.mockResolvedValue(mockSavedDetail);
    });

    it('should save appointment to PE datasource for country PE', async () => {
      expect(service.dataSourcePE).not.toBeNull();
      await service.saveAppointment(mockAppointmentPE);
      expect(service.dataSourcePE!.getRepository).toHaveBeenCalledWith(AppointmentDetail);
      expect(mockRepositoryCreate).toHaveBeenCalledWith(expect.objectContaining({ countryISO: 'PE', status: 'completed' }));
      expect(mockRepositorySave).toHaveBeenCalledWith(mockSavedDetail);
    });

    it('should save appointment to CL datasource for country CL', async () => {
      expect(service.dataSourceCL).not.toBeNull();
      await service.saveAppointment(mockAppointmentCL);
      expect(service.dataSourceCL!.getRepository).toHaveBeenCalledWith(AppointmentDetail);
      expect(mockRepositoryCreate).toHaveBeenCalledWith(expect.objectContaining({ countryISO: 'CL', status: 'completed' }));
      expect(mockRepositorySave).toHaveBeenCalledWith(mockSavedDetail);
    });

    it('should throw error if datasource is null (PE)', async () => {
      service.dataSourcePE = null;
      await expect(service.saveAppointment(mockAppointmentPE)).rejects.toThrow('Database connection for PE is not available (DataSource is null)');
    });

    it('should throw error if datasource is not initialized (CL)', async () => {
      expect(service.dataSourceCL).not.toBeNull();
      (service.dataSourceCL as any).isInitialized = false;
      await expect(service.saveAppointment(mockAppointmentCL)).rejects.toThrow(
        'Database connection for CL is not available (not initialized)'
      );
    });
  });

  describe('closeConnections', () => {
    it('should attempt to destroy PE datasource if initialized', async () => {
      service.dataSourcePE = new (DataSource as any)({ entities: [AppointmentDetail] });
      (service.dataSourcePE as any).isInitialized = true;
      service.dataSourceCL = null;
      mockDataSourceDestroy.mockClear(); 
      await service.closeConnections();
      expect(mockDataSourceDestroy).toHaveBeenCalledTimes(1);
    });

    it('should attempt to destroy CL datasource if initialized', async () => {
      service.dataSourceCL = new (DataSource as any)({ entities: [AppointmentDetail] });
      (service.dataSourceCL as any).isInitialized = true;
      service.dataSourcePE = null;
      mockDataSourceDestroy.mockClear(); 
      await service.closeConnections();
      expect(mockDataSourceDestroy).toHaveBeenCalledTimes(1);
    });

    it('should attempt to destroy both if both initialized', async () => {
      service.dataSourcePE = new (DataSource as any)({ entities: [AppointmentDetail] });
      (service.dataSourcePE as any).isInitialized = true;
      service.dataSourceCL = new (DataSource as any)({ entities: [AppointmentDetail] });
      (service.dataSourceCL as any).isInitialized = true;
      mockDataSourceDestroy.mockClear();
      await service.closeConnections();
      expect(mockDataSourceDestroy).toHaveBeenCalledTimes(2);
    });

    it('should not attempt to destroy PE datasource if not initialized', async () => {
      service.dataSourcePE = new (DataSource as any)({ entities: [AppointmentDetail] });
      (service.dataSourcePE as any).isInitialized = false;
      service.dataSourceCL = null;
      mockDataSourceDestroy.mockClear();
      await service.closeConnections();
      expect(mockDataSourceDestroy).not.toHaveBeenCalled();
    });
    
    it('should not attempt to destroy if datasource is null', async () => {
      service.dataSourcePE = null;
      service.dataSourceCL = null;
      mockDataSourceDestroy.mockClear();
      await service.closeConnections();
      expect(mockDataSourceDestroy).not.toHaveBeenCalled();
    });
  });
}); 