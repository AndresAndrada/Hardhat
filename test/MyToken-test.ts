import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseUnits } from "viem";

describe("MyToken", function () {
  async function deployMyTokenFixture() {
    const [owner, defaultAdmin, pauser, minter, otherAccount] = await hre.viem.getWalletClients();

    const myToken = await hre.viem.deployContract("MyToken", [defaultAdmin.account.address, pauser.account.address, minter.account.address], {
      from: owner.account.address,
    });

    const publicClient = await hre.viem.getPublicClient();

    return {
      myToken,
      owner,
      defaultAdmin,
      pauser,
      minter,
      otherAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Debería asignar correctamente los roles de admin, pauser y minter", async function () {
      const { myToken, defaultAdmin, pauser, minter } = await loadFixture(deployMyTokenFixture);

      expect(await myToken.read.hasRole(await myToken.read.DEFAULT_ADMIN_ROLE(), defaultAdmin.account.address)).to.be.true;
      expect(await myToken.read.hasRole(await myToken.read.PAUSER_ROLE(), pauser.account.address)).to.be.true;
      expect(await myToken.read.hasRole(await myToken.read.MINTER_ROLE(), minter.account.address)).to.be.true;
    });

    it("Debería tener el saldo inicial correcto en la cuenta del owner", async function () {
      const { myToken, owner } = await loadFixture(deployMyTokenFixture);

      const ownerBalance = await myToken.read.balanceOf(owner.account.address);
      expect(ownerBalance).to.equal(parseUnits("1000000", 18));
    });
  });

  describe("Minting", function () {
    it("Debería permitir acuñar tokens si tienes el rol de minter", async function () {
      const { myToken, minter, otherAccount } = await loadFixture(deployMyTokenFixture);

      await myToken.write.connect(minter).mint(otherAccount.account.address, parseUnits("1000", 18));
      const otherAccountBalance = await myToken.read.balanceOf(otherAccount.account.address);
      expect(otherAccountBalance).to.equal(parseUnits("1000", 18));
    });

    it("Debería revertir la acuñación de tokens si no tienes el rol de minter", async function () {
      const { myToken, owner, otherAccount } = await loadFixture(deployMyTokenFixture);

      await expect(myToken.write.connect(owner).mint(otherAccount.account.address, parseUnits("1000", 18))).to.be.rejectedWith("AccessControl: account " + owner.account.address.toLowerCase() + " is missing role " + (await myToken.read.MINTER_ROLE()));
    });
  });

  describe("Pausing", function () {
    it("Debería permitir pausar y despausar las transferencias si tienes el rol de pauser", async function () {
      const { myToken, pauser, owner, otherAccount } = await loadFixture(deployMyTokenFixture);

      await myToken.write.connect(pauser).pause();
      expect(await myToken.read.paused()).to.be.true;

      await expect(myToken.write.connect(owner).transfer(otherAccount.account.address, parseUnits("100", 18))).to.be.rejectedWith("Pausable: paused");

      await myToken.write.connect(pauser).unpause();
      expect(await myToken.read.paused()).to.be.false;

      await expect(myToken.write.connect(owner).transfer(otherAccount.account.address, parseUnits("100", 18))).to.changeTokenBalances(myToken, [owner.account.address, otherAccount.account.address], [parseUnits("-100", 18), parseUnits("100", 18)]);
    });
  });
});
