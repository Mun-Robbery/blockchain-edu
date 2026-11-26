const { resolve } = require("node:path");

const runtime = resolve(__dirname, "../.hardhat");
if (process.platform === "win32") {
  process.env.APPDATA = runtime;
  process.env.LOCALAPPDATA = runtime;
} else if (process.platform === "linux") {
  process.env.XDG_CONFIG_HOME = runtime;
  process.env.XDG_DATA_HOME = runtime;
  process.env.XDG_CACHE_HOME = runtime;
}
process.env.HARDHAT_DISABLE_TELEMETRY_PROMPT = "true";
