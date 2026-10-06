// Labels the Bluesky bot's profile as an automated account (run once at setup; the bot also checks
// it before every post):  npm run bluesky:profile
import { setUpBotProfile } from "@/lib/bluesky";

console.log(await setUpBotProfile());
