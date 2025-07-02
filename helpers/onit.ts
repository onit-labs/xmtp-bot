import wretch from 'wretch';
import { PROXY_URL } from '../constants/index.ts';

import type { Client } from 'onit-markets';
import type { Address } from 'viem';
export const PRIVATE_MARKET_TAG = '__PRIVATE';
export const XMTP_MARKET_TAG = '__XMTP';

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
				tags: filters.tags.join(","),
			}),
			sort: "createdAt",
			order: "desc",
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
					[x: string]: any;
					marketAddress: `0x${string}`;
					question: string;
					resolutionCriteria: string;
					bettingCutoff: null;
					marketType: "normal" | "days-until" | "spread" | "percentage";
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
	const marketResponse = await onit.api.markets[":address"].$get({
		param: {
			address: marketAddress,
		},
	});
	return (await marketResponse.json()) as unknown as {
		success: false;
		error: string;
	} | {
		success: true;
		data: any;
	};
}

export const getBets = async (onit: Client, userAddress: Address) => {
	// TODO update client for correct type - users is fine here
	const betsResponse = await onit.api.users[":address"].predictions.$get({
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
				predictions: any[];
			};
		};
};

export const postMarket = async (onit: Client, market: any) => {
	const marketResponse = await onit.api.markets.$post({
		json: market,
	});
	return (await marketResponse.json()) as unknown as {
		success: false;
		error: string;
	} | {
		success: true;
		data: {
			marketAddress: `0x${string}`;
			txHash: `0x${string}`;
		};
	};
};

export const callBot = async (message: string, chatId: string) => {
	const response = await wretch(`${PROXY_URL}/bot/xmtp/${chatId}/message`)
		.post({ prompt: message })
		.json<
			| {
					success: false;
					error: string;
			  }
			| {
					success: true;
					data: { message: string };
			  }
		>()
		.catch((error) => {
			console.error('Error calling bot:', error);
			throw error;
		});

	return response;
};
