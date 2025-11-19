import Stripe from 'stripe';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StripeService {
    public stripe: Stripe | null = null;
    constructor(private config: ConfigService) {
        const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
        const isActive = this.config.get<string>('STRIPE_ACTIVE') === 'true';
      
        if (secretKey && isActive) {
          this.stripe = new Stripe(secretKey);
        }
      }
}
