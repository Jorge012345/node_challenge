#!/bin/bash
# Script para configurar entorno de desarrollo local

echo "Configurando entorno de desarrollo local..."

# Crear archivo .env si no existe
if [ ! -f .env ]; then
  echo "Creando archivo .env..."
  cat > .env << EOF
NODE_ENV=development
DYNAMODB_TABLE_NAME=AppointmentTable-dev
SNS_TOPIC_ARN=arn:aws:sns:us-east-1:000000000000:AppointmentTopic-dev
SQS_QUEUE_URL_PE=https://sqs.us-east-1.amazonaws.com/000000000000/AppointmentQueuePE-dev
SQS_QUEUE_URL_CL=https://sqs.us-east-1.amazonaws.com/000000000000/AppointmentQueueCL-dev
SQS_NOTIFICATION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/000000000000/NotificationQueue-dev
EVENT_BUS_NAME=AppointmentEventBus-dev

# RDS Peru
RDS_HOST_PE=localhost
RDS_PORT_PE=3306
RDS_USERNAME_PE=root
RDS_PASSWORD_PE=password
RDS_DATABASE_PE=appointments_pe

# RDS Chile
RDS_HOST_CL=localhost
RDS_PORT_CL=3306
RDS_USERNAME_CL=root
RDS_PASSWORD_CL=password
RDS_DATABASE_CL=appointments_cl
EOF
  echo "Archivo .env creado."
else
  echo "El archivo .env ya existe."
fi

# Verificar dependencias
echo "Verificando dependencias..."
npm list serverless-offline serverless-dotenv-plugin > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Instalando dependencias faltantes..."
  npm install --save-dev serverless-offline serverless-dotenv-plugin
fi

# Crear base de datos MySQL local para pruebas (opcional)
read -p "¿Deseas crear bases de datos MySQL locales para pruebas? (s/n): " create_db
if [ "$create_db" = "s" ]; then
  echo "Creando bases de datos locales..."
  
  # Comprobar si MySQL está instalado
  which mysql > /dev/null
  if [ $? -ne 0 ]; then
    echo "Error: MySQL no está instalado. Por favor, instala MySQL primero."
    exit 1
  fi
  
  # Crear base para Perú
  echo "Creando base de datos para Perú..."
  mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS appointments_pe;"
  
  # Crear base para Chile
  echo "Creando base de datos para Chile..."
  mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS appointments_cl;"
fi

echo "Compilando el proyecto..."
npm run build

echo "¡Configuración completa!"
echo "Para iniciar el servidor en modo desarrollo: npm run start:dev"
echo "Para iniciar con serverless offline: npm run offline" 