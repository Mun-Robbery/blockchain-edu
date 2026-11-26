const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

const units = (value) => ethers.parseUnits(String(value), 18);

describe("StudyToken", function () {
  let token, owner, participant, spender;

  beforeEach(async function () {
    [owner, participant, spender] = await ethers.getSigners();
    token = await ethers.deployContract("StudyToken");
    await token.waitForDeployment();
  });

  async function event(tx, name) {
    const receipt = await tx.wait();
    return receipt.logs.map((log) => token.interface.parseLog(log)).find((log) => log.name === name);
  }

  it("выпускает 1000 STC владельцу и публикует метаданные", async function () {
    assert.equal(await token.name(), "StudyToken");
    assert.equal(await token.symbol(), "STC");
    assert.equal(await token.decimals(), 18n);
    assert.equal(await token.owner(), owner.address);
    assert.equal(await token.totalSupply(), units(1000));
    assert.equal(await token.maxSupply(), units(100000));
    assert.equal(await token.balanceOf(owner.address), units(1000));
    assert.deepEqual(Array.from((await event(token.deploymentTransaction(), "Transfer")).args),
      [ethers.ZeroAddress, owner.address, units(1000)]);
  });

  it("переводит 10 STC и создаёт событие Transfer", async function () {
    const moved = await event(await token.transfer(participant.address, units(10)), "Transfer");
    assert.deepEqual(Array.from(moved.args), [owner.address, participant.address, units(10)]);
    assert.equal(await token.balanceOf(owner.address), units(990));
    assert.equal(await token.balanceOf(participant.address), units(10));
    assert.equal(await token.totalSupply(), units(1000));
  });

  it("проверяет allowance, событие Approval и уменьшает разрешение после transferFrom", async function () {
    const approval = await event(await token.approve(spender.address, units(20)), "Approval");
    assert.deepEqual(Array.from(approval.args), [owner.address, spender.address, units(20)]);
    const transaction = await token.connect(spender).transferFrom(owner.address, participant.address, units(12));
    const transfer = await event(transaction, "Transfer");
    const adjustment = await event(transaction, "Approval");
    assert.deepEqual(Array.from(transfer.args), [owner.address, participant.address, units(12)]);
    assert.equal(adjustment.args.value, units(8));
    assert.equal(await token.allowance(owner.address, spender.address), units(8));
    assert.equal(await token.balanceOf(participant.address), units(12));
    await assert.rejects(token.connect(spender).transferFrom(owner.address, participant.address, units(9)), /InsufficientAllowance/);
  });

  it("сжигает только собственные токены и уменьшает totalSupply", async function () {
    await assert.rejects(token.connect(participant).burn(1), /InsufficientBalance/);
    const burned = await event(await token.burn(units(7)), "Transfer");
    assert.deepEqual(Array.from(burned.args), [owner.address, ethers.ZeroAddress, units(7)]);
    assert.equal(await token.balanceOf(owner.address), units(993));
    assert.equal(await token.totalSupply(), units(993));
  });

  it("ограничивает mint правом владельца и потолком текущей эмиссии", async function () {
    await assert.rejects(token.connect(participant).mint(participant.address, 1), /OnlyOwner/);
    const issued = await event(await token.mint(participant.address, units(99000)), "Transfer");
    assert.deepEqual(Array.from(issued.args), [ethers.ZeroAddress, participant.address, units(99000)]);
    await assert.rejects(token.mint(participant.address, 1), /SupplyLimit/);
    await token.connect(participant).burn(1);
    await token.mint(participant.address, 1);
    assert.equal(await token.totalSupply(), units(100000));
  });

  it("отклоняет перевод и сжигание при недостатке средств, сохраняя allowance", async function () {
    await assert.rejects(token.transfer(participant.address, units(1001)), /InsufficientBalance/);
    await assert.rejects(token.burn(units(1001)), /InsufficientBalance/);
    await token.approve(spender.address, units(1001));
    await assert.rejects(token.connect(spender).transferFrom(owner.address, participant.address, units(1001)), /InsufficientBalance/);
    assert.equal(await token.allowance(owner.address, spender.address), units(1001));
    assert.equal(await token.balanceOf(owner.address), units(1000));
  });

  it("отклоняет нулевые адреса при transfer, approve, mint и transferFrom", async function () {
    await assert.rejects(token.transfer(ethers.ZeroAddress, 0), /ZeroAddress/);
    await assert.rejects(token.approve(ethers.ZeroAddress, 0), /ZeroAddress/);
    await assert.rejects(token.mint(ethers.ZeroAddress, 0), /ZeroAddress/);
    await assert.rejects(token.transferFrom(ethers.ZeroAddress, participant.address, 0), /ZeroAddress/);
    await assert.rejects(token.transferFrom(owner.address, ethers.ZeroAddress, 0), /ZeroAddress/);
  });
});
