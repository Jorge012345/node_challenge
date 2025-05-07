# Appointment Service - Sistema de Agendamiento de Citas Médicas

Aplicación serverless con NestJS para el agendamiento de citas médicas que funciona tanto para Perú como Chile utilizando servicios de AWS.

## Arquitectura

El sistema utiliza los siguientes servicios AWS:

- **API Gateway**: Maneja las peticiones HTTP (`POST /appointments`, `GET /appointments/:insuredId`).
- **Lambda**: Lógica de procesamiento distribuida en funciones:
    - `api`: Recibe peticiones, valida, guarda estado inicial en DynamoDB y publica en SNS.
    - `appointmentPE`: Procesa citas para Perú (desde SQS), guarda en RDS PE y publica evento de completado.
    - `appointmentCL`: Procesa citas para Chile (desde SQS), guarda en RDS CL y publica evento de completado.
    - `notificationProcessor`: Procesa eventos de completado (desde SQS) y actualiza estado final en DynamoDB.
- **DynamoDB**: Almacena información de citas y su estado (`pending`, `completed`). Utiliza un índice secundario global (`InsuredIdIndex`) para búsquedas por asegurado.
- **SNS (AppointmentTopic)**: Recibe la cita inicial y la distribuye a las colas SQS correspondientes usando filtros por `countryISO`.
- **SQS**:
    - `AppointmentQueuePE`: Cola para citas de Perú.
    - `AppointmentQueueCL`: Cola para citas de Chile.
    - `NotificationQueue`: Cola para eventos de cita completada.
- **EventBridge (AppointmentEventBus)**: Recibe eventos `appointment.completed` y los enruta a `NotificationQueue` mediante una regla (`AppointmentCompletedRule`).
- **RDS**: Bases de datos MySQL separadas para detalles de citas completadas (`appointments_pe`, `appointments_cl`).
- **IAM**: Roles y políticas para otorgar los permisos necesarios a cada servicio.
- **VPC**: Las funciones Lambda se ejecutan dentro de una VPC para acceder de forma segura a RDS y utilizar VPC Endpoints para SNS.

## Flujo de Procesamiento

1.  **Recepción (API Gateway -> `api` Lambda)**: Se recibe `POST /appointments`, se valida el cuerpo, se guarda la cita en DynamoDB con estado `pending`.
2.  **Publicación (SNS)**: La lambda `api` publica la cita en `AppointmentTopic` (SNS), incluyendo `countryISO` como atributo de mensaje.
3.  **Enrutamiento (SNS -> SQS PE/CL)**: SNS filtra por `countryISO` y envía el mensaje a `AppointmentQueuePE` o `AppointmentQueueCL`.
4.  **Procesamiento País (`appointmentPE`/`CL` Lambda -> RDS)**: La lambda correspondiente consume el mensaje de SQS, establece conexión a la base de datos RDS respectiva (PE o CL) usando `TypeORM`, guarda los detalles de la cita.
5.  **Notificación Completado (`appointmentPE`/`CL` Lambda -> EventBridge)**: Tras guardar en RDS, la lambda publica un evento `appointment.completed` en `AppointmentEventBus`, incluyendo el ID de la cita.
6.  **Enrutamiento Notificación (EventBridge -> SQS Notification)**: Una regla en EventBridge (`AppointmentCompletedRule`) captura el evento y lo envía a `NotificationQueue`.
7.  **Actualización Final (`notificationProcessor` Lambda -> DynamoDB)**: La lambda consume el mensaje de `NotificationQueue`, extrae el ID de la cita y actualiza el estado del registro correspondiente en DynamoDB a `completed`.

## Requisitos

- Node.js 20.x o superior
- Serverless Framework (`npm install -g serverless`)
- AWS CLI configurado con credenciales válidas
- (Opcional) Cliente MySQL para verificar datos en RDS local o remoto.

## Variables de Entorno (`.env`)

Se necesita un archivo `.env` **principalmente para las credenciales de RDS**. Las demás variables (ARNs, URLs de colas, etc.) son resueltas automáticamente por Serverless Framework durante el despliegue a partir de los recursos creados en `serverless.yml`.

Crea un archivo `.env` en la raíz de `appointment-service` con el siguiente contenido, **reemplazando los valores de ejemplo con tus credenciales RDS reales**:

```dotenv
NODE_ENV=development # Opcional, puede influir en logs

# Necesario para que serverless-dotenv-plugin funcione
DYNAMODB_TABLE_NAME=AppointmentTable-dev # Usado por si quieres cambiar el nombre por defecto

# --- CREDENCIALES RDS REALES ---
# RDS Peru
RDS_HOST_PE=tu-endpoint-rds-pe.xxxxxxxxxx.us-east-1.rds.amazonaws.com
RDS_PORT_PE=3306
RDS_USERNAME_PE=admin # Tu usuario RDS
RDS_PASSWORD_PE=tu-contraseña-rds-pe # Tu contraseña RDS
RDS_DATABASE_PE=appointments_pe

# RDS Chile
RDS_HOST_CL=tu-endpoint-rds-cl.yyyyyyyyyy.us-east-1.rds.amazonaws.com
RDS_PORT_CL=3306
RDS_USERNAME_CL=admin # Tu usuario RDS
RDS_PASSWORD_CL=tu-contraseña-rds-cl # Tu contraseña RDS
RDS_DATABASE_CL=appointments_cl
```
**Importante:** No subas este archivo `.env` a tu repositorio Git si contiene credenciales sensibles. Añádelo a tu `.gitignore`.

## Instalación

Navega al directorio `appointment-service` y ejecuta:
```bash
npm install
```

## Desarrollo Local (Simulación Limitada)

Puedes simular la API Gateway y la lambda `api` localmente usando:
```bash
serverless offline start --stage dev
```
Esto levantará un servidor HTTP local (usualmente en el puerto 3000). Sin embargo, **no simulará** automáticamente el flujo completo de SNS, SQS, EventBridge y las lambdas consumidoras.

Para una simulación local más completa del flujo asíncrono, necesitarías instalar y configurar plugins adicionales como `serverless-offline-sns`, `serverless-offline-sqs`, y `serverless-offline-eventbridge`.

## Despliegue en AWS

1.  **Compilar el código:** Asegúrate de compilar el código TypeScript a JavaScript:
    ```bash
    npm run build
    ```
2.  **Desplegar la Pila:** Usa Serverless Framework para desplegar todos los recursos definidos en `serverless.yml`:
    ```bash
    # Despliega o actualiza el stage 'dev'. Usa --force si necesitas sobreescribir la detección de cambios.
    serverless deploy --stage dev [--force]
    ```
    El comando mostrará los endpoints de la API una vez finalizado.

## Endpoints API

### Crear Cita

- **Método:** `POST`
- **Endpoint:** `{URL_API_GATEWAY}/dev/appointments`
- **Headers:** `Content-Type: application/json`
- **Cuerpo (Body):**
  ```json
  {
    "insuredId": "12345", 
    "scheduleId": 100100,
    "countryISO": "PE" 
  }
  ```
  o
  ```json
  {
    "insuredId": "54321",
    "scheduleId": 200200,
    "countryISO": "CL" 
  }
  ```
  *Nota: `insuredId` debe ser una cadena de 5 dígitos.*

- **Respuesta Exitosa (201 Created):** Devuelve el objeto de la cita tal como se guardó inicialmente en DynamoDB (con estado `pending`).
  ```json
  {
      "id": "...",
      "insuredId": "12345",
      "scheduleId": 100100,
      "countryISO": "PE",
      "status": "pending",
      "createdAt": "...",
      "updatedAt": "..."
  }
  ```

### Listar Citas por Asegurado

- **Método:** `GET`
- **Endpoint:** `{URL_API_GATEWAY}/dev/appointments/{insuredId}`
  *Ejemplo: `{URL_API_GATEWAY}/dev/appointments/12345`*
- **Respuesta Exitosa (200 OK):** Devuelve un array con las citas encontradas en DynamoDB para ese `insuredId` (pueden estar en estado `pending` o `completed`).
  ```json
  [
    {
        "id": "...",
        "insuredId": "12345",
        "scheduleId": 100100,
        "countryISO": "PE",
        "status": "completed",
        "createdAt": "...",
        "updatedAt": "..."
    },
    {...}
  ]
  ```

## Mejoras Realizadas Durante la Implementación

1.  **Inicialización Asíncrona Segura:** Se refactorizó `DatabaseService` para usar el ciclo de vida `OnModuleInit` de NestJS, asegurando que las conexiones RDS estén listas antes de ser usadas por las lambdas `appointmentPE` y `appointmentCL`.
2.  **Gestión de Dependencias en Lambdas SQS:** Las lambdas `appointmentPE` y `appointmentCL` ahora inicializan un contexto de aplicación NestJS (`NestFactory.createApplicationContext`) para obtener instancias de servicios gestionadas correctamente y respetar el ciclo de vida.
3.  **Prevención de Conexiones RDS Innecesarias:** Se introdujo la variable de entorno `SHOULD_CONNECT_DB` (configurada en `serverless.yml`) para que solo las lambdas que necesitan RDS (`PE` y `CL`) intenten conectarse.
4.  **Validación Manual en API Lambda:** Se implementó una validación y parseo manual del cuerpo de la solicitud en `AppointmentController` como workaround para un problema de compatibilidad entre el `ValidationPipe` global y el formato de evento de API Gateway/Lambda.
5.  **Resolución de Timeouts (API -> SNS):** Se configuró un VPC Interface Endpoint para SNS para permitir la comunicación privada y rápida desde la lambda `api` (dentro de la VPC) hacia SNS, evitando timeouts.
6.  **Configuración VPC para Lambdas:** Se configuró correctamente la sección `provider.vpc` para que todas las lambdas se ejecuten en las subnets y grupo de seguridad adecuados, permitiendo el acceso a RDS y al VPC Endpoint de SNS.
7.  **Política SQS Explícita para EventBridge:** Se añadió `NotificationQueuePolicy` para garantizar que EventBridge tenga permisos explícitos para enviar mensajes a la cola de notificaciones.
8.  **Corrección de Permisos IAM:** Se eliminó una política IAM redundante e incorrecta que impedía el despliegue.

## Próximos Pasos Sugeridos

- Implementar pruebas unitarias y de integración (usando Jest y potencialmente `serverless-offline` con plugins).
- Agregar monitoreo más detallado (CloudWatch Dashboards, Métricas personalizadas) y alertas (CloudWatch Alarms, SNS).
- Implementar mecanismos de reintentos robustos y colas de mensajes muertos (DLQ) para las colas SQS.
- Considerar el uso de AWS Secrets Manager o Parameter Store para las credenciales RDS en lugar del archivo `.env`.
- Optimizar el tamaño de los paquetes Lambda (investigar por qué `serverless-webpack` falló o usar otras técnicas).
- Refinar el manejo de errores y respuestas HTTP en la lambda `api`.

## Autor

Jorge Terrazas

## Pruebas Unitarias

Para ejecutar las pruebas unitarias del `appointment-service`:

1.  Navega al directorio del servicio:
    ```bash
    cd appointment-service
    ```
2.  Ejecuta el comando de prueba de npm:
    ```bash
    npm test
    ```
    Esto utilizará Jest para correr todas las pruebas unitarias definidas en los archivos `*.spec.ts` dentro del servicio.
