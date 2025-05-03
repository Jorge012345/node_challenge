export enum AppointmentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
}

export class Appointment {
  id: string;
  insuredId: string;
  scheduleId: number;
  countryISO: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
} 