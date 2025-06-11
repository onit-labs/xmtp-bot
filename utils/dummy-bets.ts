export function generateInitialBet(marketType: string): any {
    switch (marketType) {
        case 'normal':
            return {
                mean: 50,
                stdDev: 10,
                outcomeUnit: 1
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
            return {
                options: ['Yes', 'No']
            };
        default:
            throw new Error(`Unknown market type: ${marketType}`);
    }
}
