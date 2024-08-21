import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("MyERC721", function () {
  // Fixture to deploy the contract
  async function deployMyERC721Fixture() {
    const [defaultAdmin, pauser, minter, otherAccount] = await hre.viem.getWalletClients();

    const myERC721 = await hre.viem.deployContract("MyERC721", [defaultAdmin.account.address, pauser.account.address, minter.account.address], {});

    const publicClient = await hre.viem.getPublicClient();

    return {
      myERC721,
      defaultAdmin,
      pauser,
      minter,
      otherAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should assign the default admin role", async function () {
      const { myERC721, defaultAdmin } = await loadFixture(deployMyERC721Fixture);

      const adminRole = await myERC721.read.DEFAULT_ADMIN_ROLE();
      const hasRole = await myERC721.read.hasRole([adminRole, defaultAdmin.account.address]);

      expect(hasRole).to.be.true;
    });
  });

  describe("Pausable", function () {
    it("Should allow pauser to pause and unpause", async function () {
      const { myERC721, pauser } = await loadFixture(deployMyERC721Fixture);

      const myERC721AsPauser = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: pauser } });
      await myERC721AsPauser.write.pause();
      expect(await myERC721.read.paused()).to.be.true;

      await myERC721AsPauser.write.unpause();
      expect(await myERC721.read.paused()).to.be.false;
    });

    it("Should revert if non-pauser tries to pause", async function () {
      const { myERC721, otherAccount } = await loadFixture(deployMyERC721Fixture);

      const myERC721AsOther = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: otherAccount } });
      await expect(myERC721AsOther.write.pause()).to.be.rejectedWith("AccessControlUnauthorizedAccount");
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const { myERC721, minter, otherAccount } = await loadFixture(deployMyERC721Fixture);

      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      const tokenURI = "https://example.com/token/1";
      await myERC721AsMinter.write.safeMint([otherAccount.account.address, tokenURI]);

      const tokenId = 0; // El primer token tendrá ID 0
      const mintedTokenURI = await myERC721.read.tokenURI([tokenId]);
      expect(mintedTokenURI).to.equal(tokenURI);
    });

    it("Should revert if non-minter tries to mint", async function () {
      const { myERC721, otherAccount } = await loadFixture(deployMyERC721Fixture);

      const myERC721AsOther = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: otherAccount } });
      await expect(myERC721AsOther.write.safeMint([otherAccount.account.address, "https://example.com/token/1"])).to.be.rejectedWith("AccessControlUnauthorizedAccount");
    });
  });
});
