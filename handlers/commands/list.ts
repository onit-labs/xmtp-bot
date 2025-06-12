import { fallbackMessage } from '#constants.ts';
import { getMarkets, XMTP_MARKET_TAG } from '#helpers/onit.ts';

import { stripIndents } from 'common-tags';
import { Client } from 'onit-markets';

import type { Client as XmtpClient } from '@xmtp/node-sdk';

type Conversation = NonNullable<Awaited<ReturnType<XmtpClient['conversations']['getConversationById']>>>;

export async function handleListCommand(onit: Client, conversation: Conversation, tags: string[] = []) {
	// If the first tag is 'private', add the conversation ID as a tag
	if (tags[0]?.toLowerCase() === 'private') {
		tags = [`${XMTP_MARKET_TAG}_${conversation.id.toString()}`];
	} else if (tags[0]?.toLowerCase() === 'trending') {
		tags = ['trending'];
	}

	const marketsResponse = await getMarkets(
		onit,
		tags.length > 0
			? // TODO: sanitize tags
			{ tags }
			: undefined,
	);

	if (!marketsResponse.success) {
		return await conversation.send(
			stripIndents`
			Sorry, I encountered an error processing your command. ${marketsResponse.error ?? 'Unknown error'}

			${fallbackMessage}
		`,
		);
	}

	const markets = marketsResponse.data.markets;

	if (markets.length === 0) {
		return await conversation.send(
			stripIndents`
			No markets found.

			${fallbackMessage}
		`,
		);
	}

	const isSingleTag = tags.length === 1;

	console.log({ tags })

	await conversation.send(
		stripIndents`
			${tags[0]?.toLowerCase() === 'trending' ? 'Trending Onit Markets:' :
				tags[0]?.toLowerCase().includes(`${XMTP_MARKET_TAG.toLowerCase()}_`) ? 'Your group\'s private markets:' :
					'Recent Onit Markets:'}
			\n
			${markets.map((market, index) => `${index + 1}. ${market.question}`).join('\n')}

			Market Addresses:[${markets.map((market) => market.marketAddress).join(' ,')}]
		`);

	await conversation.send(isSingleTag ? `https://onit.fun/c/${tags.at(0)}` : `https://onit.fun/`);
}
