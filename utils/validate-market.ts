import {
	createDaysUntilMarketSchema,
	createDiscreteMarketSchema,
	createNormalMarketSchema,
	createPercentageMarketSchema,
	createScoreMarketSchema,
} from '#validators/market/create.ts';

export const validateMarket = (marketData: Market) => {
	let validatedMarket;
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
