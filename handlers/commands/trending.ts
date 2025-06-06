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

	return await conversation.send(
		`Trending Onit Markets:\n\n${markets.map((market) => market.question).join('\n')}
            \nYou can find all trending markets at https://onit.fun`,
	);
}
