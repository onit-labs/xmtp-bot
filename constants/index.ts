import z from 'zod';

/* Environment variables schema */
const envSchema = z.object({
	WALLET_KEY: z.string(),
	ENCRYPTION_KEY: z.string(),
	XMTP_ENV: z.enum(['dev', 'production']),
	ONIT_API_KEY: z.string(),
	ONIT_API_URL: z.string().optional(),
});

/* Parse and export environment variables */
export let ENV: z.infer<typeof envSchema>;
try {
	ENV = envSchema.parse(process.env);
} catch (error) {
	// try again but first load dotenv
	await import('dotenv').then((dotenv) => dotenv.config());

	ENV = envSchema.parse(process.env);
}

/* Derived constants */
export const API_URL = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'preview' ? ENV.ONIT_API_URL : 'http://localhost:8787';
export const PROXY_URL = 'http://localhost:3000/proxy';

/* XMTP specific constants */
export const WALLET_KEY = ENV.WALLET_KEY;
export const ENCRYPTION_KEY = ENV.ENCRYPTION_KEY;
export const XMTP_ENV = ENV.XMTP_ENV;

/* Onit specific constants */
export const ONIT_API_KEY = ENV.ONIT_API_KEY;

export const ONIT_TEST_TRIGGERS = ['@onit-test', '@onit-test.base.eth'];
export const ONIT_TRIGGERS = [
	'@onit',
	'@onit.base.eth',
	...(process.env.NODE_ENV !== 'production' ? ONIT_TEST_TRIGGERS : []),
];
