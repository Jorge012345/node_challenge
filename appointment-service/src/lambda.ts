import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import * as serverlessHttp from 'serverless-http';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const expressApp = express();

let cachedHandler: any;

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  app.use(express.json());
  
  const config = new DocumentBuilder()
    .setTitle('Medical Appointment API')
    .setDescription('API for scheduling medical appointments')
    .setVersion('1.0')
    .addTag('appointments')
    .addServer('/dev')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  
  app.enableCors();

  await app.init();
  return serverlessHttp(expressApp);
}

export const handler = async (event: any, context: any) => {
  if (!cachedHandler) {
    cachedHandler = await bootstrap();
  }
  return cachedHandler(event, context);
}; 