// Posts the bot's intro and pins it (once, at setup):  npm run bluesky:intro
import { postIntro } from "@/lib/bluesky";

console.log(await postIntro());
