import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppointmentController } from './controllers/appointment.controller';
import { AppointmentService } from './services/appointment.service';
import { DynamoDBService } from './services/dynamodb.service';
import { SNSService } from './services/sns.service';
import { SQSService } from './services/sqs.service';
import { EventBridgeService } from './services/eventbridge.service';
import { DatabaseService } from './services/database.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppointmentController],
  providers: [
    AppointmentService,
    DynamoDBService,
    SNSService,
    SQSService,
    EventBridgeService,
    DatabaseService,
  ],
})
export class AppModule {}
