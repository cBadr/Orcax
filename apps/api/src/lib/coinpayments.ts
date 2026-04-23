import crypto from 'node:crypto';
import { request } from 'undici';
import { env } from '../config/env.js';
import { getSetting, SETTING_KEYS } from './settings.js';

// CoinPayments HMAC authentication.
//   Ref: https://a-docs.coinpayments.net/api/auth/generate-api-signature/
//   Headers: X-CoinPayments-Client, X-CoinPayments-Timestamp, X-CoinPayments-Signature
//   Signature = base64( HMAC-SHA256( secret,
//                 "﻿" + method + fullUrl + clientId + timestamp + jsonPayload ) )
//   Timestamp = UTC ISO WITHOUT milliseconds AND WITHOUT trailing Z,
//               e.g. "2025-04-22T12:34:56"
//   fullUrl   = full URL including scheme and host.
// The same client_secret verifies inbound IPN signatures — no separate webhook secret.

interface CreatedInvoice {
  invoiceId: string;
  invoiceUrl: string;
  raw: unknown;
}

interface Credentials {
  clientId: string;
  clientSecret: string;
}

// CoinPayments rejects URLs without a real domain (localhost, bare IPs, etc.).
function isPublicHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname;
    if (!host || !host.includes('.')) return false;
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function getCreds(): Promise<Credentials> {
  const clientId =
    (await getSetting<string>(SETTING_KEYS.COINPAYMENTS_CLIENT_ID)) ||
    env.COINPAYMENTS_CLIENT_ID;
  const clientSecret =
    (await getSetting<string>(SETTING_KEYS.COINPAYMENTS_CLIENT_SECRET)) ||
    env.COINPAYMENTS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('CoinPayments credentials not configured');
  }
  return { clientId, clientSecret };
}

function nowIso(): string {
  // CoinPayments wants "YYYY-MM-DDTHH:mm:ss" — no ms, no "Z".
  return new Date().toISOString().split('.')[0]!;
}

function sign(
  secret: string,
  method: string,
  url: string,
  clientId: string,
  timestamp: string,
  payload: string,
): string {
  // U+FEFF BOM is required as the first character of the signed string.
  const message = '﻿' + method.toUpperCase() + url + clientId + timestamp + payload;
  return crypto.createHmac('sha256', secret).update(message, 'utf-8').digest('base64');
}

async function signedRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const { clientId, clientSecret } = await getCreds();
  const url = `${env.COINPAYMENTS_API_URL}${path}`;
  const timestamp = nowIso();
  const payload = body ? JSON.stringify(body) : '';
  const signature = sign(clientSecret, method, url, clientId, timestamp, payload);

  const res = await request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'X-CoinPayments-Client': clientId,
      'X-CoinPayments-Timestamp': timestamp,
      'X-CoinPayments-Signature': signature,
    },
    body: payload || undefined,
  });

  const text = await res.body.text();
  if (res.statusCode >= 300) {
    throw new Error(`CoinPayments ${method} ${path} failed: ${res.statusCode} ${text}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface CreateInvoiceInput {
  amountUsd: number;
  currency?: string;
  userId: string;
  paymentId: string; // our internal Payment.id, echoed in metadata
  description: string;
}

// CoinPayments currency IDs — 5057 is their internal ID for USD fiat.
const USD_CURRENCY_ID = '5057';

export async function createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  const amountStr = input.amountUsd.toFixed(2);
  const creds = await getCreds();
  const money = {
    currencyId: USD_CURRENCY_ID,
    displayValue: amountStr,
    value: String(Math.round(input.amountUsd * 100)), // cents for USD
  };

  const payload = {
    clientId: creds.clientId,
    invoiceId: input.paymentId,
    buyer: {
      companyName: 'Customer',
      emailAddress: `${input.userId}@user.local`,
      name: {
        firstName: 'Customer',
        lastName: input.userId.slice(0, 6),
      },
    },
    description: input.description,
    currency: { id: USD_CURRENCY_ID, name: 'USD', symbol: '$' },
    items: [
      {
        name: 'Platform credit',
        description: input.description,
        quantity: { value: '1', type: 2 },
        amount: money,
      },
    ],
    amount: {
      ...money,
      breakdown: { subtotal: money },
    },
    notesToRecipient: 'Platform top-up',
    // CoinPayments only accepts publicly-reachable URLs (must be a real domain,
    // not localhost). Include only when PUBLIC_* env vars are set to an FQDN.
    ...(isPublicHttpUrl(env.PUBLIC_API_URL)
      ? { notificationsUrl: `${env.PUBLIC_API_URL}/webhooks/coinpayments/ipn` }
      : {}),
    ...(isPublicHttpUrl(env.PUBLIC_WEB_URL)
      ? {
          successUrl: `${env.PUBLIC_WEB_URL}/billing?status=success`,
          cancelUrl: `${env.PUBLIC_WEB_URL}/billing?status=cancel`,
        }
      : {}),
  };

  const data = await signedRequest<{
    invoices?: Array<{ id: string; link?: string; checkoutLink?: string }>;
  }>('POST', '/api/v1/merchant/invoices', payload);

  const inv = data.invoices?.[0];
  if (!inv?.id) {
    throw new Error('CoinPayments returned no invoice');
  }
  return {
    invoiceId: inv.id,
    invoiceUrl:
      inv.checkoutLink ??
      inv.link ??
      `https://a-checkout.coinpayments.net/checkout/?invoice-id=${inv.id}`,
    raw: data,
  };
}

// Statuses CoinPayments returns for an invoice.
export type CpInvoiceStatus =
  | 'draft'
  | 'scheduled'
  | 'unpaid'
  | 'pending'
  | 'paid'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'timedOut';

export interface CpInvoice {
  id: string; // CoinPayments UUID
  invoiceId: string; // our merchant-supplied ID (== Payment.id)
  status: CpInvoiceStatus;
  created?: string;
  confirmed?: string | null;
  completed?: string | null;
  payments?: Array<{
    paymentAddress?: string;
    actualAmount?: { displayValue?: string };
  }>;
}

// Look up an invoice by the merchant-supplied ID (our Payment.id).
export async function getInvoiceByPaymentId(paymentId: string): Promise<CpInvoice | null> {
  const data = await signedRequest<{ items?: CpInvoice[] }>(
    'GET',
    `/api/v1/merchant/invoices?invoiceId=${encodeURIComponent(paymentId)}`,
  );
  return data.items?.find((i) => i.invoiceId === paymentId) ?? null;
}

export async function getInvoiceByCpId(id: string): Promise<CpInvoice | null> {
  try {
    return await signedRequest<CpInvoice>('GET', `/api/v1/merchant/invoices/${id}`);
  } catch {
    return null;
  }
}

// Verify IPN — CoinPayments signs incoming webhooks the same way, using client_secret.
// Signature header can be `X-CoinPayments-Signature`. Some deployments also send
// `Signature`. We accept either.
export async function verifyIpnSignature(
  rawBody: string,
  providedSignature: string,
  clientId?: string,
  timestamp?: string,
  method = 'POST',
  url?: string,
): Promise<boolean> {
  if (!providedSignature) return false;
  const { clientId: myClient, clientSecret } = await getCreds();
  const effectiveClient = clientId || myClient;
  // If timestamp/url are missing (some IPN variants sign only the body), try both.
  const candidates: string[] = [];
  if (timestamp && url) {
    candidates.push(sign(clientSecret, method, url, effectiveClient, timestamp, rawBody));
  }
  // Simple body-only HMAC fallback
  candidates.push(
    crypto.createHmac('sha256', clientSecret).update(rawBody, 'utf-8').digest('base64'),
  );

  const provided = Buffer.from(providedSignature);
  for (const cand of candidates) {
    const buf = Buffer.from(cand);
    if (buf.length === provided.length && crypto.timingSafeEqual(buf, provided)) {
      return true;
    }
  }
  return false;
}
