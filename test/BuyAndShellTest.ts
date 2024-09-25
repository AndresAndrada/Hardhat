import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";

describe("Marketplace", function () {
  // Fixture to deploy the contract
  async function deployMarketplaceFixture() {
    const [owner, seller, buyer] = await ethers.getSigners();

    // Deploying the contract
    const Marketplace = await ethers.getContractFactory("Marketplace");
    const marketplace = await Marketplace.deploy();
    
    // Dummy ERC1155 token for testing
    const Token = await ethers.getContractFactory("ERC1155Token");
    const token = await Token.deploy("TestURI");

    // Mint tokens for the seller
    await token.mint(seller.address, 1, 100, "0x");

    return { marketplace, token, owner, seller, buyer };
  }

  describe("Listing Tokens", function () {
    it("Should allow a user to list tokens", async function () {
      const { marketplace, token, seller } = await loadFixture(deployMarketplaceFixture);

      // Approve the marketplace to transfer tokens
      await token.connect(seller).setApprovalForAll(marketplace.address, true);

      // List the token
      const tx = await marketplace.connect(seller).listToken(
        token.address,
        1, // tokenId
        10, // amount
        ethers.utils.parseEther("1"), // price
        [] // allowed buyers
      );
      const receipt = await tx.wait();

      const listingId = receipt.events[0].args.listingId;
      const listing = await marketplace.viewListingById(listingId);

      expect(listing.contractAddress).to.equal(token.address);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.tokensAvailable).to.equal(10);
      expect(listing.price).to.equal(ethers.utils.parseEther("1"));
    });
  });

  describe("Purchasing Tokens", function () {
    it("Should allow a user to purchase listed tokens", async function () {
      const { marketplace, token, seller, buyer } = await loadFixture(deployMarketplaceFixture);

      // Approve the marketplace to transfer tokens
      await token.connect(seller).setApprovalForAll(marketplace.address, true);

      // List the token
      const tx = await marketplace.connect(seller).listToken(
        token.address,
        1, // tokenId
        10, // amount
        ethers.utils.parseEther("1"), // price
        [] // allowed buyers
      );
      const receipt = await tx.wait();
      const listingId = receipt.events[0].args.listingId;

      // Purchase the token
      const purchaseTx = await marketplace.connect(buyer).purchaseToken(listingId, 5, { value: ethers.utils.parseEther("5") });
      await purchaseTx.wait();

      const listing = await marketplace.viewListingById(listingId);
      expect(listing.tokensAvailable).to.equal(5); // Tokens reduced after purchase
    });

    it("Should revert if insufficient funds are sent", async function () {
      const { marketplace, token, seller, buyer } = await loadFixture(deployMarketplaceFixture);

      // Approve the marketplace to transfer tokens
      await token.connect(seller).setApprovalForAll(marketplace.address, true);

      // List the token
      const tx = await marketplace.connect(seller).listToken(
        token.address,
        1, // tokenId
        10, // amount
        ethers.utils.parseEther("1"), // price
        [] // allowed buyers
      );
      const receipt = await tx.wait();
      const listingId = receipt.events[0].args.listingId;

      // Attempt to purchase with insufficient funds
      await expect(
        marketplace.connect(buyer).purchaseToken(listingId, 5, { value: ethers.utils.parseEther("3") })
      ).to.be.revertedWith("Incorrect ETH amount sent");
    });
  });
});
