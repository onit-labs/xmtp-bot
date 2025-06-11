export const commands = {
	list: {
		command: "list",
		description: "List all markets",
		usage: "/list [tag]",
		example: "/list sport",
	},
	trending: {
		command: "trending",
		description: "List all trending markets",
		usage: "/trending",
		example: "/trending",
	},
	positions: {
		command: "positions",
		description: "List all your positions",
		usage: "/positions",
		example: "/positions",
	},
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
