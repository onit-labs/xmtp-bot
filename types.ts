import type { Client as XmtpClient } from '@xmtp/node-sdk';

export type XmtpConversation = NonNullable<Awaited<ReturnType<XmtpClient['conversations']['getConversationById']>>>;