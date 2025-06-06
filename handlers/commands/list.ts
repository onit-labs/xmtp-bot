import { fallbackMessage } from '#constants.ts';
import { getMarkets } from '#helpers/onit.ts';

import { stripIndents } from 'common-tags';
import { Client } from 'onit-markets';

import type { Client as XmtpClient } from '@xmtp/node-sdk';

type Conversation = NonNullable<Awaited<ReturnType<XmtpClient['conversations']['getConversationById']>>>;

export async function handleListCommand(onit: Client, conversation: Conversation, tags: string[] = []) {
	const marketsResponse = await getMarkets(
		onit,
		tags.length > 0
			? // TODO: sanitize tags
			{ tags: tags.map((tag) => tag.toLowerCase()) }
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

	await conversation.send(
		stripIndents`
			Recent Onit Markets:\n\n
			${markets.map((market) => market.question).join('\n')}
		`);

	await conversation.send(isSingleTag ? `https://onit.fun/c/${tags.at(0)}` : `https://onit.fun/`);
}
