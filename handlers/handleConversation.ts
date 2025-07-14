import { WELCOME_MESSAGES } from '#constants/messages.ts';

import type { XmtpClient, XmtpConversation } from '#clients/xmtp.ts';

// TODO store all conversations in case we want to go back an update with new capabilities
// const welcomeMessagesSent = new Set<string>();

/**
 * Tracks the last sync time to detect new conversations
 */
let lastSyncTime = Date.now();

/**
 * Check if a conversation is new (created after the last sync)
 * @param conversation - The conversation to check
 * @returns true if the conversation is new
 */
// function isNewConversation(conversation: XmtpConversation): boolean {
//     try {
//         // Check if we've already sent a welcome message to this conversation
//         if (welcomeMessagesSent.has(conversation.id)) {
//             return false;
//         }

//         // For now, we'll consider a conversation new if we haven't sent a welcome message
//         // In a more sophisticated implementation, we could track conversation creation time
//         return true;
//     } catch (error) {
//         console.error('Error checking if conversation is new:', error);
//         return false;
//     }
// }

// TMP fix to avoid breaking old conversations
const WELCOME_MESSAGE_CUTOFF_TIMESTAMP = 1752493443000;

/**
 * Send a welcome message to a conversation
 * @param conversation - The conversation to send the welcome message to
 * @param client - The XMTP client instance
 */
export async function sendWelcomeMessage(conversation: XmtpConversation, client: XmtpClient): Promise<void> {
    // Skip conversations created before the specified timestamp (1752433813 in seconds)
    const conversationCreatedAt = new Date(conversation.createdAt).getTime();
    if (conversationCreatedAt < WELCOME_MESSAGE_CUTOFF_TIMESTAMP) {
        console.log(`Skipping welcome message for conversation ${conversation.id} (created before cutoff: ${new Date(conversationCreatedAt).toISOString()})`);
        return;
    }

    // // Skip if we've already sent a welcome message to this conversation
    // if (welcomeMessagesSent.has(conversation.id)) {
    //     return;
    // }

    // Get conversation metadata to determine if it's a DM or group
    const metadata = await conversation.metadata();
    const isDirectMessage = metadata?.conversationType === 'dm';

    // Select appropriate welcome message
    const welcomeMessage = isDirectMessage ? WELCOME_MESSAGES.DM : WELCOME_MESSAGES.GROUP;

    // Send the welcome message
    await conversation.send(welcomeMessage);

    // Mark this conversation as having received a welcome message
    //welcomeMessagesSent.add(conversation.id);

    console.log(`Welcome message sent to ${isDirectMessage ? 'DM' : 'group'} conversation: ${conversation.id}`);
}

// /**
//  * Check for new conversations and send welcome messages
//  * @param client - The XMTP client instance
//  */
// export async function checkForNewConversations(client: XmtpClient): Promise<void> {
//     try {
//         // Get all conversations
//         const conversations = await client.conversations.list();

//         // Check each conversation for welcome message eligibility
//         for (const conversation of conversations) {
//             if (isNewConversation(conversation)) {
//                 await sendWelcomeMessage(conversation, client);
//             }
//         }
//     } catch (error) {
//         console.error('Error checking for new conversations:', error);
//     }
// }


/**
 * Handle welcome message for first-time DM conversations
 * This is called when processing a message to check if it's the first message in a DM
 * @param conversation - The conversation where the message was received
 * @param client - The XMTP client instance
 * @param isFirstMessage - Whether this is the first message in the conversation
 */
// export async function handleFirstMessageWelcome(
//     conversation: XmtpConversation,
//     client: XmtpClient,
//     isFirstMessage: boolean = false
// ): Promise<void> {
//     try {
//         // Skip if we've already sent a welcome message to this conversation
//         if (welcomeMessagesSent.has(conversation.id)) {
//             return;
//         }

//         // Get conversation metadata
//         const metadata = await conversation.metadata();
//         const isDirectMessage = metadata?.conversationType === 'dm';

//         // Only send welcome message for DMs on first message or if explicitly requested
//         if (isDirectMessage && (isFirstMessage || !welcomeMessagesSent.has(conversation.id))) {
//             // Check if this is truly the first user message (not from the bot)
//             const messages = await conversation.messages({ limit: 10 });
//             const userMessages = messages.filter(msg => msg.senderInboxId.toLowerCase() !== client.inboxId.toLowerCase());

//             // If this is the first user message, send welcome
//             if (userMessages.length <= 1) {
//                 await sendWelcomeMessage(conversation, client);
//             }
//         }
//     } catch (error) {
//         console.error('Error handling first message welcome:', error);
//     }
// }

/**
 * Reset the welcome message tracking (useful for testing or restarting)
 */
// function resetWelcomeMessageTracking(): void {
//     welcomeMessagesSent.clear();
//     lastSyncTime = Date.now();
//     console.log('Welcome message tracking reset');
// } 