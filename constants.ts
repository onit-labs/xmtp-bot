export const commands = {
	list: {
		command: "list",
		description: "List all markets",
		usage: "/list [tag]",
		example: "/list sports",
	},
	trending: {
		command: "trending",
		description: "List all trending markets",
		usage: "/trending",
		example: "/trending",
	},
	// watch: {
	// 	command: "watch",
	// 	description: "Get notifications for market activity",
	// 	usage: "/watch [market address] [frequency (all, daily, weekly, monthly)]",
	// },
} as const;
