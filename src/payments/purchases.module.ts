import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { DatabaseModule } from '../database/database.module';
import { StripeService } from '../payments/stripe.service';
import { WebhookController } from './webhook.controller';

@Module({
    imports: [DatabaseModule],
    controllers: [PurchasesController, WebhookController],
    providers: [StripeService],
})
export class PurchasesModule { }
