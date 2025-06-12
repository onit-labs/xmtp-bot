export const commands = {
	list: {
		command: "list",
		description: "List all markets",
		usage: "@onit list [tag]",
		example: "@onit list sport",
	},
	trending: {
		command: "trending",
		description: "List all trending markets",
		usage: "@onit trending",
		example: "@onit trending",
	},
	bets: {
		command: "bets",
		description: "List your own bets, or pass someone's basename",
		usage: "@onit bets [basename]",
		example: "@onit bets @jamco1",
	},
	copy: {
		command: "copy",
		description: "Deploy a private market for your group",
		usage: "1) Call '@onit list' to see available markets\n2) Call '@onit copy [market number]'",
		example: "\n1) Call '@onit list' to see available markets\n2) Call '@onit copy [market number]'",
	}
	// watch: {
	// 	command: "watch",
	// 	description: "Get notifications for market activity",
	// 	usage: "/watch [market address] [frequency (all, daily, weekly, monthly)]",
	// },
} as const;

export const fallbackMessage =
	"Available commands:\n\n" +
	Object.values(commands)
		.map((c) => `/${c.command} - ${c.description} \neg. ${c.example}`)
		.join("\n\n") +
	"\n\n" +
	"You can find all markets at https://onit.fun/";
