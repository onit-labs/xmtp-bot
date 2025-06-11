import { createDiscreteMarketSchema } from "../helpers/validators/market/create";
import { createDaysUntilMarketSchema } from "../helpers/validators/market/create";
import { createNormalMarketSchema, createPercentageMarketSchema, createScoreMarketSchema } from "../helpers/validators/market/create";

export const validateMarket = (marketData: any) => {
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
}