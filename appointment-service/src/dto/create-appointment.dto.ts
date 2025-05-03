import { IsString, IsNumber, Matches, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({
    description: 'Código del asegurado (5 dígitos)',
    example: '12345',
  })
  @IsString()
  @IsNotEmpty()
  @Length(5, 5, { message: 'insuredId debe tener 5 dígitos' })
  @Matches(/^\d{5}$/, { message: 'insuredId debe contener solo dígitos' })
  insuredId: string;

  @ApiProperty({
    description: 'Identificador del espacio para agendar una cita',
    example: 100,
  })
  @IsNumber()
  @IsNotEmpty()
  scheduleId: number;

  @ApiProperty({
    description: 'Identificador del país (PE o CL)',
    example: 'PE',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(PE|CL)$/, { message: 'countryISO debe ser PE o CL' })
  countryISO: string;
} 