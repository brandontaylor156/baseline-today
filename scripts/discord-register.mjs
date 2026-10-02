// Registers the bot's slash commands with Discord (run once, and after changing commands).
// Reads DISCORD_APP_ID and DISCORD_BOT_TOKEN from .env.local; prints only the result.
//   node scripts/discord-register.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const appId = env.DISCORD_APP_ID;
const token = env.DISCORD_BOT_TOKEN;
if (!appId || !token) {
  console.error("Add DISCORD_APP_ID and DISCORD_BOT_TOKEN to .env.local first.");
  process.exit(1);
}

const commands = [
  {
    name: "odds",
    description: "Model win chances and head-to-head for two players",
    options: [
      { type: 3, name: "player1", description: "First player (e.g. sinner)", required: true },
      { type: 3, name: "player2", description: "Second player (e.g. alcaraz)", required: true },
    ],
  },
  {
    name: "rankings",
    description: "Top 10 of a tour",
    options: [{ type: 3, name: "tour", description: "atp or wta", required: true, choices: [{ name: "ATP", value: "atp" }, { name: "WTA", value: "wta" }] }],
  },
  { name: "results", description: "Latest results" },
];

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
console.log(res.ok ? `Registered ${commands.length} commands.` : `Failed: ${res.status} ${await res.text()}`);
console.log(`Invite link: https://discord.com/oauth2/authorize?client_id=${appId}&scope=applications.commands`);
