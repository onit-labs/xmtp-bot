
export function generateInitialBet(market: any): any {
    switch (market.marketType) {
        case 'normal':
            return {
                mean: 50,
                stdDev: 10,
                outcomeUnit: market.outcomeUnit ?? 1
            };
        case 'percentage':
            return {
                percentage: 50,
                range: 10
            };
        case 'score':
            return {
                firstSideScore: "0",
                secondSideScore: "0"
            };
        case 'days-until':
            return {
                from: "30",
                to: "40"
            };
        case 'discrete':
            return [market.metadata.options[0].id];
        default:
            throw new Error(`Unknown market type: ${market.marketType}`);
    }
}
