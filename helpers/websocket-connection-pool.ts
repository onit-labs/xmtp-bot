import z from 'zod';

import type { XmtpConversation } from '#types.ts';

// Response structure returned by the Cloudflare worker.
// Example: { success: true, data: { requestId: "<id>", chatId: "<chatId>", message: "<bot-response>" } }
export interface BotResponse {
	success: boolean;
	data: {
		requestId: string;
		chatId: string;
		message: string;
	};
}

// WebSocket connection pool and request management
interface WSConnection {
	ws: WebSocket;
	conversation: XmtpConversation;
	isConnecting: boolean;
	lastUsed: number;
	requestCount: number;
}

interface PendingRequest {
	// biome-ignore lint/suspicious/noExplicitAny: any as unknown doesn't cover the void | PromiseLike<void> case
	resolve: (value: any) => void;
	// biome-ignore lint/suspicious/noExplicitAny: any as unknown doesn't cover the void | PromiseLike<void> case
	reject: (error: any) => void;
	timeout: NodeJS.Timeout;
	timestamp: number;
}

const acknowledgementSchema = z.object({
	type: z.literal('cf_agent_mcp_servers'),
	mcp: z.object({
		servers: z.record(
			z.string(),
			z.object({
				auth_url: z.string().nullable(),
				capabilities: z.object({
					tools: z.record(z.string(), z.any()),
				}),
				instructions: z.string().nullable(),
				name: z.string(),
				server_url: z.string(),
				state: z.enum(['ready', 'error', 'loading']),
			}),
		),
		tools: z.array(
			z.object({
				name: z.string(),
				description: z.string(),
				inputSchema: z.object({
					type: z.string(),
					properties: z.record(z.string(), z.any()).optional(),
					required: z.array(z.string()).optional(),
					additionalProperties: z.boolean().optional(),
					$schema: z.string(),
				}),
				serverId: z.string(),
			}),
		),
	}),
});

const responseSchema = z.object({
	success: z.boolean(),
	data: z.object({
		requestId: z.string(),
		chatId: z.string(),
		message: z.string(),
	}),
});

export class WebSocketConnectionPool {
	private connections = new Map<string, WSConnection>();
	private pendingRequests = new Map<string, PendingRequest>();
	private readonly maxConnections = 10;
	private readonly connectionTimeout = 30000; // 30 seconds
	private readonly idleTimeout = 300000; // 5 minutes
	private readonly maxRequestsPerConnection = 1000;
	private cleanupInterval: NodeJS.Timeout;

	constructor() {
		// Start cleanup routine
		this.cleanupInterval = setInterval(() => {
			this.cleanupIdleConnections();
		}, 60000); // Cleanup every minute
	}

	private async createConnection(conversation: XmtpConversation): Promise<WebSocket> {
		const wsUrl = `ws://localhost:8787/bot/xmtp/${conversation.id}/message`;
		console.log(`Creating WebSocket connection for chat ${conversation.id}:`, wsUrl);

		const ws = new WebSocket(wsUrl);
		const connectionEntry: WSConnection = {
			ws,
			conversation,
			isConnecting: true,
			lastUsed: Date.now(),
			requestCount: 0,
		};

		this.connections.set(conversation.id, connectionEntry);

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.connections.delete(conversation.id);
				reject(new Error('WebSocket connection timeout'));
			}, this.connectionTimeout);

			ws.onopen = () => {
				console.log('WebSocket connection opened for chat', conversation.id);
				clearTimeout(timeout);
				connectionEntry.isConnecting = false;
				resolve(ws);
			};

			ws.onmessage = (event: MessageEvent) => {
				const acknowledgement = acknowledgementSchema.safeParse(JSON.parse(event.data));

				// the first message is a connection acknowledgement & contains the information of the bots available functions
				if (acknowledgement.success && acknowledgement.data.type === 'cf_agent_mcp_servers') {
					console.log('WebSocket acknowledgement message received for chat', conversation.id, acknowledgement.data);
				} else {
					this.handleMessage(event, conversation);
				}
			};

			ws.onerror = (error: Event) => {
				console.log('WebSocket error for chat', conversation.id);
				clearTimeout(timeout);
				console.error(`WebSocket error for chat ${conversation.id}:`, error);
				this.connections.delete(conversation.id);
				if (connectionEntry.isConnecting) {
					reject(error);
				}
			};

			ws.onclose = () => {
				console.log('WebSocket connection closed for chat', conversation.id);
				this.connections.delete(conversation.id);
				this.rejectPendingRequests(conversation.id);
			};
		});
	}

	private handleMessage(event: MessageEvent, conversation: XmtpConversation) {
		try {
			const response = responseSchema.parse(JSON.parse(event.data));
			console.log(
				`[WebSocketConnectionPool handleMessage] WebSocket response received for chat ${conversation.id}:`,
				response,
			);

			if (!response.success) {
				console.error(
					`[WebSocketConnectionPool handleMessage] WebSocket response received for chat ${conversation.id}:`,
					response,
				);
				return;
			}

			if (response.data.requestId && this.pendingRequests.has(response.data.requestId)) {
				const request = this.pendingRequests.get(response.data.requestId)!;
				clearTimeout(request.timeout);
				this.pendingRequests.delete(response.data.requestId);
				request.resolve(response);
			}

			// conversation.send(response.data.message);
		} catch (error) {
			console.error(`Error parsing WebSocket message for chat ${conversation.id}:`, error);
		}
	}

	private rejectPendingRequests(chatId: string) {
		// Find and reject requests for this chat
		for (const [requestId, request] of this.pendingRequests) {
			if (requestId.startsWith(chatId)) {
				clearTimeout(request.timeout);
				request.reject(new Error('WebSocket connection closed'));
				this.pendingRequests.delete(requestId);
			}
		}
	}

	private cleanupIdleConnections() {
		const now = Date.now();
		const toRemove: string[] = [];

		for (const [chatId, connection] of this.connections) {
			if (now - connection.lastUsed > this.idleTimeout || connection.requestCount > this.maxRequestsPerConnection) {
				toRemove.push(chatId);
			}
		}

		for (const chatId of toRemove) {
			console.log(`Cleaning up idle connection for chat ${chatId}`);
			const connection = this.connections.get(chatId);
			if (connection?.ws) {
				connection.ws.close();
			}
			this.connections.delete(chatId);
		}

		// If we have too many connections, remove the oldest ones
		if (this.connections.size > this.maxConnections) {
			const sorted = Array.from(this.connections.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);

			const excess = sorted.slice(0, this.connections.size - this.maxConnections);
			for (const [chatId, connection] of excess) {
				console.log(`Removing excess connection for chat ${chatId}`);
				connection.ws.close();
				this.connections.delete(chatId);
			}
		}
	}

	private async getConnection(conversation: XmtpConversation): Promise<WebSocket> {
		const existing = this.connections.get(conversation.id);

		// Return existing healthy connection
		if (existing && !existing.isConnecting && existing.ws.readyState === 1) {
			existing.lastUsed = Date.now();
			return existing.ws;
		}

		// Wait for connecting connection
		if (existing?.isConnecting) {
			return new Promise((resolve, reject) => {
				const checkConnection = () => {
					const conn = this.connections.get(conversation.id);
					if (conn && !conn.isConnecting && conn.ws.readyState === 1) {
						conn.lastUsed = Date.now();
						resolve(conn.ws);
					} else if (!conn) {
						reject(new Error('Connection failed during setup'));
					} else {
						setTimeout(checkConnection, 100);
					}
				};
				checkConnection();
			});
		}

		// Create new connection
		return this.createConnection(conversation);
	}

	async sendRequest(message: string, conversation: XmtpConversation): Promise<BotResponse> {
		try {
			const ws = await this.getConnection(conversation);
			const connection = this.connections.get(conversation.id);

			if (connection) {
				connection.requestCount++;
				connection.lastUsed = Date.now();
			}

			// Generate unique request ID with chat prefix
			const requestId = `${conversation.id}_${crypto.randomUUID()}`;

			// Create request payload
			const request = {
				requestId,
				chatId: conversation.id,
				prompt: message,
			};

			// Send the request
			ws.send(JSON.stringify(request));
			console.log(`WebSocket request sent for chat ${conversation.id}:`, request);

			// Wait for response with timeout.  The promise resolves once `handleMessage` receives the
			// corresponding response and calls `request.resolve`.
			return new Promise<BotResponse>((resolve, reject) => {
				const timeout = setTimeout(() => {
					this.pendingRequests.delete(requestId);
					reject(new Error('WebSocket request timeout'));
				}, this.connectionTimeout);

				this.pendingRequests.set(requestId, {
					resolve,
					reject,
					timeout,
					timestamp: Date.now(),
				});
			});
		} catch (error) {
			console.error(`Error sending WebSocket request for chat ${conversation.id}:`, error);
			throw error;
		}
	}

	getStats() {
		return {
			activeConnections: this.connections.size,
			pendingRequests: this.pendingRequests.size,
			connections: Array.from(this.connections.entries()).map(([chatId, conn]) => ({
				chatId,
				isConnecting: conn.isConnecting,
				lastUsed: new Date(conn.lastUsed).toISOString(),
				requestCount: conn.requestCount,
				readyState: conn.ws.readyState,
			})),
		};
	}

	destroy() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}

		// Close all connections
		for (const [_chatId, connection] of this.connections) {
			connection.ws.close();
		}
		this.connections.clear();

		// Reject all pending requests
		for (const [_requestId, request] of this.pendingRequests) {
			clearTimeout(request.timeout);
			request.reject(new Error('Connection pool destroyed'));
		}
		this.pendingRequests.clear();
	}
}
