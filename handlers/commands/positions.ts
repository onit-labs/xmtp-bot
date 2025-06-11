import { fallbackMessage } from '#constants.ts';
import { getPositions } from '#helpers/onit.ts';

import { stripIndents } from 'common-tags';
import { Client } from 'onit-markets';

import type { Client as XmtpClient } from '@xmtp/node-sdk';

type Conversation = NonNullable<Awaited<ReturnType<XmtpClient['conversations']['getConversationById']>>>;

export async function handlePositionsCommand(onit: Client, conversation: Conversation, client: XmtpClient, senderInboxId: string) {
    // TESTING
    const inboxState = await client.preferences.inboxStateFromInboxIds([senderInboxId]);
    const memberAddress = '0x640Ac7F7B96C72653d2F1161dBBAD3B7B7d81a23' // inboxState[0]?.identifiers[0]?.identifier;

    if (!memberAddress) {
        return await conversation.send(
            stripIndents`
      Sorry, I couldn't find your wallet address.

      ${fallbackMessage}
    `,
        );
    }

    const predictionsResponse = await getPositions(onit, memberAddress as `0x${string}`);

    if (!predictionsResponse.success) {
        return await conversation.send(
            stripIndents`
      Sorry, I encountered an error processing your command. ${predictionsResponse.error ?? 'Unknown error'}

      ${fallbackMessage}
    `,
        );
    }

    const predictions = predictionsResponse.data.predictions;

    if (predictions.length === 0) {
        return await conversation.send(
            stripIndents`
      You don't have any active positions.

      ${fallbackMessage}
    `,
        );
    }

    // await conversation.send(
    //     stripIndents`
    //   Your Active Positions:\n\n
    //   ${predictions.map((market: { question: string }) => market.question).join('\n')}
    // `);

    await conversation.send(`Check out your Onit positions!`);
    await conversation.send(`https://onit.fun/u/${memberAddress}`);
} 