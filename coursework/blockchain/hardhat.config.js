require("@nomicfoundation/hardhat-ethers");
const path = require("node:path");
const { subtask } = require("hardhat/config");
const {
  TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
} = require("hardhat/builtin-tasks/task-names");

const fromHere = (...parts) => path.resolve(__dirname, ...parts);

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (args, hre, runSuper) => {
  const coursework = await runSuper(args);
  return [...coursework, fromHere("../../lab1/contracts/StudyToken.sol")];
});

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, hre, runSuper) => {
  if (solcVersion !== "0.8.24") return runSuper();
  return {
    compilerPath: require.resolve("solc/soljson.js"),
    isSolcJs: true,
    version: solcVersion,
    longVersion: require("solc").version(),
  };
});

module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  paths: {
    root: fromHere("../.."),
    sources: fromHere("contracts"),
    tests: fromHere("test"),
    artifacts: fromHere("artifacts"),
    cache: fromHere("cache"),
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
  },
};
