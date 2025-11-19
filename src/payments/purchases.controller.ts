// purchases.controller.ts
import { BadRequestException, Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guard';
import { GetUser } from '../users/decorator';
import { DatabaseService } from '../database/database.service';
import { StripeService } from './stripe.service';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Controller('purchases')
export class PurchasesController {
    constructor(private db: DatabaseService, private stripeSvc: StripeService) { }

    @Post('create-intent')
    @UseGuards(JwtGuard)
    async createIntent(@GetUser('id') userId: number, @Body() dto: { cockpitId: number }) {
        if(!this.stripeSvc.stripe){
            console.log('Stripe is not initialized. Check STRIPE_SECRET_KEY and STRIPE_ACTIVE');
            return;
        }

        const cockpit = await this.db.cockpit.findUnique({ where: { id: dto.cockpitId } });
        if (!cockpit || !cockpit.isForSale || !cockpit.priceCents || !cockpit.currency) {
            throw new BadRequestException('This cockpit is not for sale');
        }

        const currency = cockpit.currency.toLowerCase();
        const amount = cockpit.priceCents;

        // (необязательно) валидация минимума
        const minByCurrency: Record<string, number> = { usd: 50, eur: 50, czk: 1500 };
        if (minByCurrency[currency] && amount < minByCurrency[currency]) {
            throw new BadRequestException(`Amount too small for ${currency.toUpperCase()}`);
        }

        // 1) попробуем найти существующую покупку
        let purchase = await this.db.purchase.findUnique({
            where: { userId_cockpitId: { userId, cockpitId: dto.cockpitId } },
            select: { id: true, providerRef: true, status: true },
        });

        // 2) если нет — создаём (без гонок)
        if (!purchase) {
            try {
                purchase = await this.db.purchase.create({
                    data: {
                        userId,
                        cockpitId: dto.cockpitId,
                        amountCents: amount,
                        currency: cockpit.currency,
                        provider: 'stripe',
                    },
                    select: { id: true, providerRef: true, status: true },
                });
            } catch (e: any) {
                // если параллельный запрос успел создать запись — забираем её
                if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
                    purchase = await this.db.purchase.findUnique({
                        where: { userId_cockpitId: { userId, cockpitId: dto.cockpitId } },
                        select: { id: true, providerRef: true, status: true },
                    });
                    if (!purchase) throw e; // крайне маловероятно
                } else {
                    throw e;
                }
            }
        }

        // 3) создаём новый PaymentIntent (или переиспользуем старый, если хочешь)
        const pi = await this.stripeSvc.stripe.paymentIntents.create({
            amount,
            currency,
            automatic_payment_methods: { enabled: true },
            metadata: { purchaseId: String(purchase.id), userId: String(userId), cockpitId: String(dto.cockpitId) },
        });

        // сохраним link на PI (по желанию)
        await this.db.purchase.update({
            where: { id: purchase.id },
            data: { providerRef: pi.id },
        });

        return { clientSecret: pi.client_secret };
    }
}
