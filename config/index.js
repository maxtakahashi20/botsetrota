const fs = require("node:fs");
const path = require("node:path");

function loadConfig() {
  const configPath = path.join(__dirname, "config.json");
  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw);

  if (!cfg.guildId) throw new Error("config.guildId ausente em config/config.json");
  if (!Array.isArray(cfg.allowedRoleIds)) throw new Error("config.allowedRoleIds deve ser um array");
  if (!cfg.panelChannelId) throw new Error("config.panelChannelId ausente em config/config.json");
  if (!cfg.requestsChannelId) throw new Error("config.requestsChannelId ausente em config/config.json");
  if (!cfg.onApprove || !Array.isArray(cfg.onApprove.roleIds)) {
    throw new Error("config.onApprove.roleIds deve ser um array em config/config.json");
  }

  return cfg;
}

module.exports = { loadConfig };
