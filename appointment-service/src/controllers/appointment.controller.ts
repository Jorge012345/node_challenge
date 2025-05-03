import { Controller, Post, Get, Param, BadRequestException, Logger, Req, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { AppointmentService } from '../services/appointment.service';
import { Appointment } from '../models/appointment.model';
import { Request } from 'express';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentController {
  private readonly logger = new Logger(AppointmentController.name);
  
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agendar una cita médica' })
  @ApiResponse({ 
    status: 201, 
    description: 'Cita agendada en proceso',
    type: Appointment 
  })
  @ApiQuery({ name: 'country', enum: ['PE', 'CL'], required: false })
  @ApiBody({ type: CreateAppointmentDto })
  async createAppointment(
    @Req() req: Request,
    @Query('country') country?: string
  ): Promise<Appointment> {
    this.logger.log(`Received appointment request. Query params: ${JSON.stringify(req.query)}`);
    
    let bodyObject: any;
    try {
      if (Buffer.isBuffer(req.body)) {
        this.logger.log('Request body is a Buffer, attempting to parse...');
        bodyObject = JSON.parse(req.body.toString());
      } else if (typeof req.body === 'string' && req.body.length > 0) {
        this.logger.log('Request body is a string, attempting to parse...');
        bodyObject = JSON.parse(req.body);
      } else if (typeof req.body === 'object' && req.body !== null) {
        if (req.body.type === 'Buffer' && Array.isArray(req.body.data)) {
             this.logger.log('Request body is a serialized Buffer object, attempting to parse...');
             bodyObject = JSON.parse(Buffer.from(req.body.data).toString());
        } else {
             this.logger.log('Request body seems to be a parsed object.');
             bodyObject = req.body;
        }
      } else {
        this.logger.warn('Request body is empty or of unexpected type.');
        bodyObject = {}; 
      }
    } catch (parseError) {
      this.logger.error(`Failed to parse request body: ${parseError}`, parseError.stack);
      throw new BadRequestException('Invalid JSON body format');
    }
    
    this.logger.log(`Parsed body object: ${JSON.stringify(bodyObject)}`);

    const createAppointmentDto = plainToClass(CreateAppointmentDto, bodyObject);
    this.logger.log(`Manually converted DTO: ${JSON.stringify(createAppointmentDto)}`);

    const errors = await validate(createAppointmentDto);
    if (errors.length > 0) {
      this.logger.error(`Manual validation failed: ${JSON.stringify(errors)}`);
      const formattedErrors = errors.map(err => Object.values(err.constraints || {})).flat();
      throw new BadRequestException(formattedErrors);
    }

    this.logger.log(`Manual validation passed. DTO: ${JSON.stringify(createAppointmentDto)}`);

    try {
      if (!createAppointmentDto.countryISO) {
        createAppointmentDto.countryISO = (country === 'CL') ? 'CL' : 'PE';
      }
            
      if (createAppointmentDto.countryISO !== 'PE' && createAppointmentDto.countryISO !== 'CL') {
        throw new BadRequestException('El país solo puede ser PE o CL');
      }
      
      this.logger.log(`Creating appointment with data: ${JSON.stringify(createAppointmentDto)}`);
      return this.appointmentService.createAppointment(createAppointmentDto);
    } catch (error) {
      if (error instanceof BadRequestException) {
          throw error;
      }
      this.logger.error(`Error creating appointment: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al procesar la solicitud');
    }
  }

  @Get(':insuredId')
  @ApiOperation({ summary: 'Obtener citas por ID de asegurado' })
  @ApiParam({ name: 'insuredId', description: 'ID del asegurado (5 dígitos)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de citas del asegurado',
    type: [Appointment] 
  })
  async getAppointmentsByInsuredId(@Param('insuredId') insuredId: string): Promise<Appointment[]> {
    this.logger.log(`Getting appointments for insured ID: ${insuredId}`);
    
    if (!insuredId || !insuredId.match(/^\d{5}$/)) {
      throw new BadRequestException('El ID del asegurado debe tener 5 dígitos');
    }
    
    return this.appointmentService.getAppointmentsByInsuredId(insuredId);
  }
} 