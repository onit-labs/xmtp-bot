import { fallbackMessage } from '#constants.ts';
import { stripIndents } from 'common-tags';
import { Client } from 'onit-markets';
import type { Client as XmtpClient } from '@xmtp/node-sdk';
import { getMarket } from '#helpers/onit.ts';
import { isAddress } from 'viem';
import SuperJSON from 'superjson';
import { generateInitialBet } from '#helpers/dummy-bets.ts';
import { validateMarket } from '#helpers/validate-market.ts';

type Conversation = NonNullable<Awaited<ReturnType<XmtpClient['conversations']['getConversationById']>>>;

export async function handleCopyCommand(onit: Client, conversation: Conversation, marketNumber: string) {
    // Get the last message from the conversation
    const messages = await conversation.messages();
    const lastMessage = messages[messages.length - 3]; // Most recent message

    if (!lastMessage || typeof lastMessage.content !== 'string') {
        return await conversation.send(
            stripIndents`
            No previous message found. Please use /list first to see available markets.

            ${fallbackMessage}
            `,
        );
    }

    // Extract addresses from the last message
    const addressMatch = lastMessage.content.match(/Market Addresses:\[(.*?)\]/);
    if (!addressMatch || !addressMatch[1]) {
        return await conversation.send(
            stripIndents`
            Could not find market addresses in the previous message. Please use /list first.

            ${fallbackMessage}
            `,
        );
    }

    const addresses = addressMatch[1].split(',').map((addr: string) => addr.trim());
    const index = parseInt(marketNumber) - 1;

    if (isNaN(index) || index < 0 || index >= addresses.length) {
        return await conversation.send(
            stripIndents`
            Invalid market number. Please select a number from the list.

            ${fallbackMessage}
            `,
        );
    }

    // const marketAddress = '0xaD61e491564D76a41DC823Ca95acd3Db5B3b4dBc' //addresses[index];
    const marketAddress = addresses[index];
    console.log({ marketAddress })

    if (!marketAddress || !isAddress(marketAddress)) {
        return await conversation.send(
            stripIndents`
            Invalid market address. Please use /list first.

            ${fallbackMessage}
            `,
        );
    }

    // Get the market details
    const marketResponse = await getMarket(onit, marketAddress);
    console.log({ marketResponse })

    if (!marketResponse.success) {
        return await conversation.send(
            stripIndents`
            Sorry, I encountered an error fetching the market. ${marketResponse.error ?? 'Unknown error'}

            ${fallbackMessage}
            `,
        );
    }

    const marketToCopy = marketResponse.data;
    console.log({ marketToCopy })

    // Create a copy of the market
    const marketData = {
        ...marketToCopy,
        question: marketToCopy.questionTitle,
        bettingCutoff: 99n, // TODO NEEDS updated
        metadata: {
            ...marketToCopy.metadata,
            tags: [...(marketToCopy.metadata?.tags ?? []), '__PRIVATE']
        },
        // todo handle outcome unit
        initialBet: generateInitialBet(marketToCopy.marketType)
    };

    // Validate the market data based on its type
    const validatedMarket = validateMarket(marketData);
    if (!validatedMarket) {
        return await conversation.send(
            stripIndents`
                Invalid market type: ${marketToCopy.marketType}

                ${fallbackMessage}
                `,
        );
    }
    console.log({ validatedMarket })

    const createResponse = await onit.api.markets.$post({
        json: JSON.parse(SuperJSON.stringify(validatedMarket))
    });

    if (!createResponse.success) {
        return await conversation.send(
            stripIndents`
            Sorry, I encountered an error copying the market. ${createResponse.error ?? 'Unknown error'}

            ${fallbackMessage}
            `,
        );
    }

    const newMarket = createResponse.data;
    await conversation.send(`Market copied successfully! View it here: https://onit.fun/m/${newMarket.id}`);
} 