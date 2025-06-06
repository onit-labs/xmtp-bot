import type { Client } from "onit-markets";

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
