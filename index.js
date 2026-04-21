require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  REST,
  Routes
} = require("discord.js");

// Import explícito: em alguns hosts existe `config.json` na raiz e o Node pode
// resolver `require("./config")` para JSON (sem `loadConfig`). Isso quebra o deploy.
const { loadConfig } = require("./config/index.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN) throw new Error("DISCORD_TOKEN não definido no .env");
if (!CLIENT_ID) throw new Error("DISCORD_CLIENT_ID não definido no .env");

const config = loadConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});

client.commands = new Collection();
client.config = config;

function loadCommands() {
  const commandsDir = path.join(__dirname, "commands");
  if (!fs.existsSync(commandsDir)) return [];

  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"));
  const slashData = [];

  for (const file of files) {
    const filePath = path.join(commandsDir, file);
    const cmd = require(filePath);
    if (!cmd?.data?.name || typeof cmd.execute !== "function") {
      throw new Error(`Comando inválido em ${filePath}`);
    }

    client.commands.set(cmd.data.name, cmd);
    slashData.push(cmd.data.toJSON());
  }

  return slashData;
}

async function registerSlashCommands(slashData) {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, config.guildId), {
    body: slashData
  });
}

function loadEvents() {
  const eventsDir = path.join(__dirname, "events");
  if (!fs.existsSync(eventsDir)) return;

  const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    const filePath = path.join(eventsDir, file);
    const ev = require(filePath);
    if (!ev?.name || typeof ev.execute !== "function") {
      throw new Error(`Evento inválido em ${filePath}`);
    }

    if (ev.once) client.once(ev.name, (...args) => ev.execute(client, ...args));
    else client.on(ev.name, (...args) => ev.execute(client, ...args));
  }
}

(async () => {
  const slashData = loadCommands();
  loadEvents();

  // discord.js v14: 'ready' ainda funciona, mas pode emitir aviso de depreciação
  // dependendo do runtime. Usamos 'clientReady' quando disponível.
  client.once("clientReady", async () => {
    try {
      await registerSlashCommands(slashData);
      // eslint-disable-next-line no-console
      console.log(`✅ Logado como ${client.user.tag} e comandos registrados.`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("❌ Falha ao registrar slash commands:", err);
    }
  });

  await client.login(TOKEN);
})();

