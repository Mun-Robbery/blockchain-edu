const { ContractFactory, formatUnits, parseUnits } = require("ethers");
const { artifact, printReceipt, run } = require("./local");

run(async (provider) => {
  const owner = await provider.getSigner(0);
  const participant = await provider.getSigner(1);
  const { abi, bytecode } = await artifact("StudyToken");
  const token = await new ContractFactory(abi, bytecode, owner).deploy();
  await printReceipt("Развёртывание StudyToken", token.deploymentTransaction(), token);
  await printReceipt(
    "Перевод 10 STC", await token.transfer(participant.address, parseUnits("10", 18)), token,
  );
  console.log(`Владелец: ${formatUnits(await token.balanceOf(owner.address), 18)} STC`);
  console.log(`Получатель: ${formatUnits(await token.balanceOf(participant.address), 18)} STC`);
});
