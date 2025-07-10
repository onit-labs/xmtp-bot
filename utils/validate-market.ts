import {
	createDaysUntilMarketSchema,
	createDiscreteMarketSchema,
	createNormalMarketSchema,
	createPercentageMarketSchema,
	createScoreMarketSchema,
} from '#validators/market/create.ts';

import type { z } from 'zod';

type Market =
	| z.infer<typeof createNormalMarketSchema>
	| z.infer<typeof createPercentageMarketSchema>
	| z.infer<typeof createScoreMarketSchema>
	| z.infer<typeof createDaysUntilMarketSchema>
	| z.infer<typeof createDiscreteMarketSchema>;

export const validateMarket = (marketData: Market) => {
	let validatedMarket: Market | null = null;
	switch (marketData.marketType) {
		case 'normal':
			validatedMarket = createNormalMarketSchema.parse(marketData);
			break;
		case 'percentage':
			validatedMarket = createPercentageMarketSchema.parse(marketData);
			break;
		case 'score':
			validatedMarket = createScoreMarketSchema.parse(marketData);
			break;
		case 'days-until':
			validatedMarket = createDaysUntilMarketSchema.parse(marketData);
			break;
		case 'discrete':
			validatedMarket = createDiscreteMarketSchema.parse(marketData);
			break;
		default:
			validatedMarket = null;
	}
	return validatedMarket;
};
