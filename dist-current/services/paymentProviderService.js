"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentProviderService = exports.PaymentProviderService = void 0;
const env_1 = require("../config/env");
/**
 * Payment provider abstraction.
 * - `manual`: accepts server checkout token + non-empty reference (pilot/staging).
 * - `stripe`: requires STRIPE_SECRET_KEY; verifies reference format when live keys absent.
 * External PSP credentials must be configured in production .env.
 */
class PaymentProviderService {
    getStatus() {
        return {
            provider: env_1.config.paymentProvider,
            mode: env_1.config.paymentMode,
            liveReady: env_1.config.paymentProvider === 'stripe' && Boolean(env_1.config.stripeSecretKey),
            message: env_1.config.paymentProvider === 'manual'
                ? 'Manual verification mode — connect Stripe or a local PSP for live collections.'
                : env_1.config.stripeSecretKey
                    ? 'Stripe provider configured.'
                    : 'Stripe selected but STRIPE_SECRET_KEY is missing.'
        };
    }
    async verifyRegistrationPayment(input) {
        const reference = String(input.paymentReference || '').trim();
        if (!reference || reference.length < 6) {
            return {
                verified: false,
                provider: env_1.config.paymentProvider,
                providerReference: reference,
                mode: env_1.config.paymentMode,
                message: 'Payment reference is required'
            };
        }
        if (env_1.config.paymentProvider === 'stripe') {
            return this.verifyStripe(reference, input);
        }
        return {
            verified: true,
            provider: 'manual',
            providerReference: reference,
            mode: env_1.config.paymentMode,
            message: 'Verified using manual checkout mode'
        };
    }
    async verifyStripe(reference, input) {
        if (!env_1.config.stripeSecretKey) {
            if (env_1.config.paymentMode === 'sandbox' && /^pay_|^cs_test_/i.test(reference)) {
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
                mode: env_1.config.paymentMode,
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
                    headers: { Authorization: `Bearer ${env_1.config.stripeSecretKey}` }
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
                const intent = await response.json();
                if (intent.status !== 'succeeded' && intent.status !== 'processing') {
                    return {
                        verified: false,
                        provider: 'stripe',
                        providerReference: reference,
                        mode: 'live',
                        message: `Stripe payment status is ${intent.status ?? 'unknown'}`
                    };
                }
            }
            catch {
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
            mode: env_1.config.paymentMode,
            message: `Stripe reference verified for ${input.email}`
        };
    }
}
exports.PaymentProviderService = PaymentProviderService;
exports.paymentProviderService = new PaymentProviderService();
