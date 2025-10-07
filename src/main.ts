import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableCors({
        origin: 'http://localhost:3000', // адрес фронтенда
        credentials: true,
    });
    app.use('/payments/stripe/webhook', bodyParser.raw({ type: '*/*' })); // шире: '*/*'
    app.use(bodyParser.json());
    app.use(cookieParser());
    await app.listen(process.env.PORT ?? 3333);
}
bootstrap();
