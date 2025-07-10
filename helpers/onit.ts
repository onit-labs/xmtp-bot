import { WebSocketConnectionPool } from './websocket-connection-pool.ts';

import type { Client } from 'onit-markets';
import type { Address } from 'viem';
import type { XmtpClient, XmtpConversation, XmtpMessage } from '#clients/xmtp.ts';

export const PRIVATE_MARKET_TAG = '__PRIVATE';
export const XMTP_MARKET_TAG = '__XMTP';

// Global connection pool instance
const wsPool = new WebSocketConnectionPool();

// Graceful shutdown handling
if (typeof process !== 'undefined') {
	process.on('SIGINT', () => {
		console?.log('Shutting down WebSocket connection pool...');
		wsPool.destroy();
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		console?.log('Shutting down WebSocket connection pool...');
		wsPool.destroy();
		process.exit(0);
	});
}

export async function getMarkets(
	onit: Client,
	filters?: {
		tags?: string[];
	},
) {
	const marketsResponse = await onit.api.markets.$get({
		query: {
			...(filters?.tags &&
				filters.tags.length > 0 && {
					tags: filters.tags.join(','),
				}),
			sort: 'createdAt',
			order: 'desc',
			limit: 5,
			offset: 0,
		},
	});
	return (await marketsResponse.json()) as unknown as
		| {
				success: false;
				error: string;
		  }
		| {
				success: true;
				data: {
					markets: {
						[x: string]: unknown;
						marketAddress: `0x${string}`;
						question: string;
						resolutionCriteria: string;
						bettingCutoff: null;
						marketType: 'normal' | 'days-until' | 'spread' | 'percentage';
						createdAt: string;
						deployer: {
							id: string;
							name: string;
							pfpUrl: string | null;
						};
					}[];
				};
		  };
}

export const getMarket = async (onit: Client, marketAddress: Address) => {
	const marketResponse = await onit.api.markets[':address'].$get({
		param: {
			address: marketAddress,
		},
	});
	return (await marketResponse.json()) as unknown as
		| {
				success: false;
				error: string;
		  }
		| {
				success: true;
				data: unknown;
		  };
};

export const getBets = async (onit: Client, userAddress: Address) => {
	// @ts-expect-error: TODO update client for correct type - users is fine here
	const betsResponse = await onit.api.users[':address'].predictions.$get({
		param: {
			address: userAddress,
		},
	});
	return (await betsResponse.json()) as unknown as
		| {
				success: false;
				error: string;
		  }
		| {
				success: true;
				data: {
					predictions: unknown[];
				};
		  };
};

export const postMarket = async (onit: Client, market: unknown) => {
	const marketResponse = await onit.api.markets.$post({
		json: market,
	});
	return (await marketResponse.json()) as unknown as
		| {
				success: false;
				error: string;
		  }
		| {
				success: true;
				data: {
					marketAddress: `0x${string}`;
					txHash: `0x${string}`;
				};
		  };
};

export const callBot = async (message: XmtpMessage<true>, conversation: XmtpConversation, client: XmtpClient) => {
	return wsPool.sendRequest(message, conversation, client);
};

// Export stats function for monitoring
export const getWebSocketStats = () => {
	return wsPool.getStats();
};
