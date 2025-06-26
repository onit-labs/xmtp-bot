import { getClient } from "onit-markets";
import { API_URL, ONIT_API_KEY } from "../constants";

if (!ONIT_API_KEY) {
    throw new Error("ONIT_API_KEY is required but not provided in environment variables");
}

if (!API_URL) {
    throw new Error("API_URL is required but not provided");
}

// Initialize the client with your API endpoint
export const onitClient = getClient(API_URL, {
    headers: {
        Authorization: `Bearer ${ONIT_API_KEY}`,
    },
});