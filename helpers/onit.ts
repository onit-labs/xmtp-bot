import type { Client } from "onit-markets";
import { Address } from "viem";

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

export const getPositions = async (onit: Client, userAddress: Address) => {
	// TODO update client for correct type - users is fine here
	const positionsResponse = await onit.api.users[":address"].predictions.$get({
		param: {
			address: userAddress,
		},
	});
	return (await positionsResponse.json()) as unknown as
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