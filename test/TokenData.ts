import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("TokenData", function () {
  // Fixture to deploy the contract
  async function deployTokenDataFixture() {
    const [owner, otherAccount] = await hre.viem.getWalletClients();

    const tokenData = await hre.viem.deployContract("TokenData", [], { client: { wallet: owner } });

    const publicClient = await hre.viem.getPublicClient();

    return {
      tokenData,
      owner,
      otherAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { tokenData, owner } = await loadFixture(deployTokenDataFixture);

      const contractOwner = await tokenData.read.owner();
      expect(contractOwner.toString().toLowerCase()).to.equal(owner.account.address.toString().toLowerCase());
    });
  });

  describe("Setting and Getting Token Data", function () {
    it("Should allow the owner to set token data", async function () {
      const { tokenData, owner } = await loadFixture(deployTokenDataFixture);

      const tokenInfo = {
        imageUrl: "https://example.com/image.png",
        name: "Koin",
        symbol: "KNRT",
        graphClone: [["2023-01-01", "1.00"], ["2023-01-02", "1.10"]],
        changePercent24Hr: "5.5",
        supply: "1000000",
        volumeUsd24Hr: "50000",
        vwap24Hr: "1.05",
        marketCapUsd: "1050000"
      };

      await tokenData.write.setTokenData([tokenInfo], { account: owner.account  });
      const result = await tokenData.read.getTokenData();

      expect(result.imageUrl).to.equal(tokenInfo.imageUrl);
      expect(result.name).to.equal(tokenInfo.name);
      expect(result.symbol).to.equal(tokenInfo.symbol);
      expect(result.graphClone[0][0]).to.equal(tokenInfo.graphClone[0][0]);
      expect(result.graphClone[0][1]).to.equal(tokenInfo.graphClone[0][1]);
      expect(result.changePercent24Hr).to.equal(tokenInfo.changePercent24Hr);
      expect(result.supply).to.equal(tokenInfo.supply);
      expect(result.volumeUsd24Hr).to.equal(tokenInfo.volumeUsd24Hr);
      expect(result.vwap24Hr).to.equal(tokenInfo.vwap24Hr);
      expect(result.marketCapUsd).to.equal(tokenInfo.marketCapUsd);
    });

  })
});
