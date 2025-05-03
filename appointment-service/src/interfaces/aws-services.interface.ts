import { Appointment } from '../models/appointment.model';

export interface IDynamoDBService {
  saveAppointment(appointment: Appointment): Promise<Appointment>;
  getAppointmentsByInsuredId(insuredId: string): Promise<Appointment[]>;
  updateAppointmentStatus(id: string, status: string): Promise<Appointment>;
}

export interface ISNSService {
  publishAppointment(appointment: Appointment): Promise<void>;
}

export interface ISQSService {
  sendMessage(queueUrl: string, message: any): Promise<void>;
  receiveMessage(queueUrl: string): Promise<any>;
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
}

export interface IEventBridgeService {
  putEvent(eventBusName: string, source: string, detailType: string, detail: any): Promise<void>;
} 