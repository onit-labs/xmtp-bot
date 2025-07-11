export const commands = {
	list: {
		command: "list",
		description: "List markets",
		usage: "/list [trending | private | tag]",
		example: "/list [trending | private | tag]\ntrending = top markets\nprivate = your group's private markets\ntag = sport, nba, market, etc.",
	},
	help: {
		command: "help",
		description: "Show help",
		usage: "/help",
		example: "/help",
	},
	// bets: {
	// 	command: "bets",
	// 	description: "List your own bets, or pass a basename",
	// 	usage: "/bets [basename]",
	// 	example: "/bets @jamco1",
	// },
	// copy: {
	// 	command: "copy",
	// 	description: "Deploy a private market for your group!",
	// 	usage: "1) Call '@onit list' to see available markets\n2) Call '@onit copy [market number]'",
	// 	example: "\n1) Call '@onit list' to see available markets\n2) Call '@onit copy [market number]'",
	// }
	// watch: {
	// 	command: "watch",
	// 	description: "Get notifications for market activity",
	// 	usage: "/watch [market address] [frequency (all, daily, weekly, monthly)]",
	// },
} as const;

export const fallbackMessage =
	"You can chat with the Onit agent by starting your message with @onit\n\n" +
	"Or use a command directly:\n\n" +
	Object.values(commands)
		.map((c) => `${c.command}: ${c.description} \neg. ${c.example}`)
		.join("\n\n") +
	"\n\n" +
	"You can find all markets at https://onit.fun/";
