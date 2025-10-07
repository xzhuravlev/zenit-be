import Stripe from 'stripe';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StripeService {
    public stripe: Stripe;
    constructor(private config: ConfigService) {
        this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!);
    }
}
