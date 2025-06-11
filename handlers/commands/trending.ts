import { fallbackMessage } from '#constants.ts';
import { getMarkets } from '#helpers/onit.ts';

import { stripIndents } from 'common-tags';
import { Client } from 'onit-markets';

import type { Client as XmtpClient } from '@xmtp/node-sdk';

type Conversation = NonNullable<Awaited<ReturnType<XmtpClient['conversations']['getConversationById']>>>;

export async function handleTrendingCommand(onit: Client, conversation: Conversation) {
	const marketsResponse = await getMarkets(onit, { tags: ['trending'] });

	if (!marketsResponse.success) {
		return await conversation.send(
			stripIndents`
			Sorry, I encountered an error processing your command. ${marketsResponse.error}

			${fallbackMessage}
		`,
		);
	}

	const markets = marketsResponse.data.markets;

	if (markets.length === 0) {
		return await conversation.send(`No markets found. You can find all our markets at https://onit.fun/`);
	}

	await conversation.send(
		stripIndents`
		Trending Onit Markets:\n\n
		${markets.map((market, index) => `${index + 1}. ${market.question}`).join('\n')}

		Market Addresses:[${markets.map((market) => market.marketAddress).join(' ,')}]
		`);

	return await conversation.send(`https://onit.fun`);
}
