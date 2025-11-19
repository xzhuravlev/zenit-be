// src/payments/webhook.controller.ts
import { Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import Stripe from 'stripe';

@Controller('payments')
export class WebhookController {
    constructor(
        private stripeSvc: StripeService,
        private config: ConfigService,
        private db: DatabaseService,
    ) { }

    @Post('stripe/webhook')
    async handle(@Req() req: Request, @Res() res: Response) {
        if(!this.stripeSvc.stripe){
            console.log('Stripe is not initialized. Check STRIPE_SECRET_KEY and STRIPE_ACTIVE');
            return;
        }
        console.log('>>> Webhook hit!'); // <-- первый маркер

        const sig = req.headers['stripe-signature'] as string;
        console.log('Stripe signature header:', sig);

        let event: Stripe.Event;
        try {
            const buf: Buffer =
                (req as any).rawBody || // если где-то выставляешь
                (Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from(JSON.stringify(req.body || {})));

            event = this.stripeSvc.stripe.webhooks.constructEvent(
                buf,
                req.headers['stripe-signature'] as string,
                this.config.get<string>('STRIPE_WEBHOOK_SECRET')!,
            );

            console.log('✅ Event constructed:', event.type);
        } catch (err) {
            console.error('❌ Webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
        }

        if (event.type === 'payment_intent.succeeded') {
            const pi = event.data.object as Stripe.PaymentIntent;
            console.log('🎉 Payment succeeded for intent:', pi.id, 'metadata:', pi.metadata);

            const purchaseId = Number(pi.metadata?.purchaseId);
            if (purchaseId) {
                try {
                    await this.db.purchase.update({
                        where: { id: purchaseId },
                        data: { status: 'SUCCEEDED', providerRef: pi.id },
                    });
                    console.log('✅ Purchase updated to SUCCEEDED, id =', purchaseId);
                } catch (e) {
                    console.error('❌ Failed to update purchase in DB:', e);
                }
            } else {
                console.warn('⚠️ No purchaseId in metadata!');
            }
        } else {
            console.log('ℹ️ Ignored event type:', event.type);
        }

        res.json({ received: true });
    }
}
