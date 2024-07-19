import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("MyToken", function () {
  // Fixture to deploy the contract
  async function deployMyTokenFixture() {
    const [defaultAdmin, pauser, minter, otherAccount] = await hre.viem.getWalletClients();

    const myToken = await hre.viem.deployContract("MyToken", [defaultAdmin.account.address, pauser.account.address, minter.account.address], {});

    const publicClient = await hre.viem.getPublicClient();

    return {
      myToken,
      defaultAdmin,
      pauser,
      minter,
      otherAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should assign the default admin role", async function () {
      const { myToken, defaultAdmin } = await loadFixture(deployMyTokenFixture);

      const adminRole = await myToken.read.DEFAULT_ADMIN_ROLE();
      const hasRole = await myToken.read.hasRole([adminRole, defaultAdmin.account.address]);

      expect(hasRole).to.be.true;
    });

    it("Should mint initial supply to deployer", async function () {
      const { myToken, defaultAdmin } = await loadFixture(deployMyTokenFixture);

      const initialSupply = 1000000n * 10n ** 18n; // Ajustar los decimales según corresponda
      const balance = await myToken.read.balanceOf([defaultAdmin.account.address]);
      expect(balance).to.equal(initialSupply);
    });
  });

  describe("Pausable", function () {
    it("Should allow pauser to pause and unpause", async function () {
      const { myToken, pauser } = await loadFixture(deployMyTokenFixture);

      // Pausar el contrato
      const myTokenAsPauser = await hre.viem.getContractAt("MyToken", myToken.address, { client: { wallet: pauser } });
      await myTokenAsPauser.write.pause();
      expect(await myToken.read.paused()).to.be.true;

      // Despausar el contrato
      await myTokenAsPauser.write.unpause();
      expect(await myToken.read.paused()).to.be.false;
    });

    it("Should revert if non-pauser tries to pause", async function () {
      const { myToken, otherAccount } = await loadFixture(deployMyTokenFixture);

      const myTokenAsOther = await hre.viem.getContractAt("MyToken", myToken.address, { client: { wallet: otherAccount } });
      await expect(myTokenAsOther.write.pause()).to.be.rejectedWith("AccessControlUnauthorizedAccount");
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const { myToken, minter, otherAccount } = await loadFixture(deployMyTokenFixture);

      const myTokenAsMinter = await hre.viem.getContractAt("MyToken", myToken.address, { client: { wallet: minter } });
      const amountToMint = 500n * 10n ** 18n; // Ajustar los decimales según corresponda
      await myTokenAsMinter.write.mint([otherAccount.account.address, amountToMint]);

      const balance = await myToken.read.balanceOf([otherAccount.account.address]);
      expect(balance).to.equal(amountToMint);
    });

    it("Should revert if non-minter tries to mint", async function () {
      const { myToken, otherAccount } = await loadFixture(deployMyTokenFixture);

      const myTokenAsOther = await hre.viem.getContractAt("MyToken", myToken.address, { client: { wallet: otherAccount } });
      await expect(myTokenAsOther.write.mint([otherAccount.account.address, 1000n])).to.be.rejectedWith("AccessControlUnauthorizedAccount");
    });
  });

  describe("Burning", function () {
    it("Should allow tokens to be burned", async function () {
      const { myToken, defaultAdmin } = await loadFixture(deployMyTokenFixture);

      const myTokenAsDefaultAdmin = await hre.viem.getContractAt("MyToken", myToken.address, { client: { wallet: defaultAdmin } });
      const balanceBefore = await myToken.read.balanceOf([defaultAdmin.account.address]);
      const amountToBurn = 100n * 10n ** 18n; // Ajustar los decimales según corresponda

      await myTokenAsDefaultAdmin.write.burn([amountToBurn]);

      const balanceAfter = await myToken.read.balanceOf([defaultAdmin.account.address]);
      expect(balanceAfter).to.equal(balanceBefore - amountToBurn);
    });
  });
});
