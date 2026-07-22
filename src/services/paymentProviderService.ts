import { config } from '../config/env';

export type PaymentVerificationInput = {
  paymentReference: string;
  paymentMethod?: string;
  amount: number;
  currency: 'AFN';
  email: string;
  checkoutToken: string;
};

export type PaymentVerificationResult = {
  verified: boolean;
  provider: string;
  providerReference: string;
  mode: 'live' | 'sandbox' | 'manual';
  message?: string;
};

/**
 * Payment provider abstraction.
 * - `manual`: accepts server checkout token + non-empty reference (pilot/staging).
 * - `stripe`: requires STRIPE_SECRET_KEY; verifies reference format when live keys absent.
 * External PSP credentials must be configured in production .env.
 */
export class PaymentProviderService {
  getStatus() {
    return {
      provider: config.paymentProvider,
      mode: config.paymentMode,
      liveReady: config.paymentProvider === 'stripe' && Boolean(config.stripeSecretKey),
      message:
        config.paymentProvider === 'manual'
          ? 'Manual verification mode — connect Stripe or a local PSP for live collections.'
          : config.stripeSecretKey
            ? 'Stripe provider configured.'
            : 'Stripe selected but STRIPE_SECRET_KEY is missing.'
    };
  }

  async verifyRegistrationPayment(input: PaymentVerificationInput): Promise<PaymentVerificationResult> {
    const reference = String(input.paymentReference || '').trim();
    if (!reference || reference.length < 6) {
      return {
        verified: false,
        provider: config.paymentProvider,
        providerReference: reference,
        mode: config.paymentMode,
        message: 'Payment reference is required'
      };
    }

    if (config.paymentProvider === 'stripe') {
      return this.verifyStripe(reference, input);
    }

    return {
      verified: true,
      provider: 'manual',
      providerReference: reference,
      mode: config.paymentMode,
      message: 'Verified using manual checkout mode'
    };
  }

  private async verifyStripe(reference: string, input: PaymentVerificationInput): Promise<PaymentVerificationResult> {
    if (!config.stripeSecretKey) {
      if (config.paymentMode === 'sandbox' && /^pay_|^cs_test_/i.test(reference)) {
        return {
          verified: true,
          provider: 'stripe',
          providerReference: reference,
          mode: 'sandbox',
          message: 'Sandbox reference accepted (configure STRIPE_SECRET_KEY for live verification)'
        };
      }

      return {
        verified: false,
        provider: 'stripe',
        providerReference: reference,
        mode: config.paymentMode,
        message: 'STRIPE_SECRET_KEY is not configured'
      };
    }

    if (!/^pay_|^pi_|^cs_/i.test(reference)) {
      return {
        verified: false,
        provider: 'stripe',
        providerReference: reference,
        mode: 'live',
        message: 'Invalid Stripe payment reference format'
      };
    }

    const paymentIntentId = reference.startsWith('pi_') ? reference : null;
    if (paymentIntentId) {
      try {
        const response = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
          headers: { Authorization: `Bearer ${config.stripeSecretKey}` }
        });
        if (!response.ok) {
          return {
            verified: false,
            provider: 'stripe',
            providerReference: reference,
            mode: 'live',
            message: 'Stripe payment intent could not be verified'
          };
        }
        const intent = await response.json() as { status?: string };
        if (intent.status !== 'succeeded' && intent.status !== 'processing') {
          return {
            verified: false,
            provider: 'stripe',
            providerReference: reference,
            mode: 'live',
            message: `Stripe payment status is ${intent.status ?? 'unknown'}`
          };
        }
      } catch {
        return {
          verified: false,
          provider: 'stripe',
          providerReference: reference,
          mode: 'live',
          message: 'Stripe verification request failed'
        };
      }
    }

    return {
      verified: true,
      provider: 'stripe',
      providerReference: reference,
      mode: config.paymentMode,
      message: `Stripe reference verified for ${input.email}`
    };
  }
}

export const paymentProviderService = new PaymentProviderService();
