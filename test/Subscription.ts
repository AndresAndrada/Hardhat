import { expect } from "chai";
import { ethers } from "hardhat";

describe("Subscription Contract", function () {
  async function deploySubscriptionFixture() {
    const accounts = await ethers.getSigners();
    const initialOwner = accounts[0];
    const SubscriptionFactory = await ethers.getContractFactory("Subscription");
    const subscription = await SubscriptionFactory.deploy(initialOwner.address);
    await subscription.waitForDeployment();
    return { subscription, accounts };
  }

  describe("Deployment", function () {
    it("should set the initial owner", async function () {
      const { subscription, accounts } = await deploySubscriptionFixture();
      expect(await subscription.owner()).to.equal(accounts[0].address);
    });
  });

  describe("Minting and Subscriptions", function () {
    it("should mint a token and store tokenURI, but tokenURI access requires active subscription", async function () {
      const { subscription, accounts } = await deploySubscriptionFixture();
      await subscription.safeMint(accounts[0].address, "ipfs://test");
      const owner = await subscription.ownerOf(0);
      expect(owner).to.equal(accounts[0].address);
      await expect(subscription.tokenURI(0)).to.be.revertedWith("Subscription required to access token URI");
    });

    it("should allow token owner to set lender parameters", async function () {
      const { subscription, accounts } = await deploySubscriptionFixture();
      await subscription.safeMint(accounts[0].address, "ipfs://test");
      const amount = ethers.parseEther("1.0");
      const billingInterval = 3600;
      await subscription.setLenderParams(0, amount, billingInterval);
      const params = await subscription.getLenderParams(0);
      expect(params.amount).to.equal(amount);
      expect(params.billingInterval).to.equal(billingInterval);
    });

    it("should not allow non-token owner to set lender parameters", async function () {
      const { subscription, accounts } = await deploySubscriptionFixture();
      await subscription.safeMint(accounts[0].address, "ipfs://test");
      const amount = ethers.parseEther("1.0");
      const billingInterval = 3600;
      await expect(
        subscription.connect(accounts[1]).setLenderParams(0, amount, billingInterval)
      ).to.be.revertedWith("Not the token owner");
    });

    it("should allow a borrower to pay subscription and access tokenURI", async function () {
      const { subscription, accounts } = await deploySubscriptionFixture();
      await subscription.safeMint(accounts[0].address, "ipfs://test");
      const amount = ethers.parseEther("1.0");
      const billingInterval = 3600;
      await subscription.setLenderParams(0, amount, billingInterval);
      await subscription.connect(accounts[1]).paySubscription(0, { value: amount });
      const uri = await subscription.connect(accounts[1]).tokenURI(0);
      expect(uri).to.equal("ipfs://test");
    });

    it("should not allow paying subscription with incorrect payment", async function () {
      const { subscription, accounts } = await deploySubscriptionFixture();
      await subscription.safeMint(accounts[0].address, "ipfs://test");
      const amount = ethers.parseEther("1.0");
      const billingInterval = 3600;
      await subscription.setLenderParams(0, amount, billingInterval);
      await expect(
        subscription.connect(accounts[1]).paySubscription(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Incorrect payment amount");
    });

    it("should not allow a borrower to pay subscription if already active", async function () {
      const { subscription, accounts } = await deploySubscriptionFixture();
      await subscription.safeMint(accounts[0].address, "ipfs://test");
      const amount = ethers.parseEther("1.0");
      const billingInterval = 3600;
      await subscription.setLenderParams(0, amount, billingInterval);
      await subscription.connect(accounts[1]).paySubscription(0, { value: amount });
      await expect(
        subscription.connect(accounts[1]).paySubscription(0, { value: amount })
      ).to.be.revertedWith("Borrower already has an active subscription");
    });

    it("should allow token owner to revoke subscription after expiration", async function () {
      const { subscription, accounts } = await deploySubscriptionFixture();
      await subscription.safeMint(accounts[0].address, "ipfs://test");
      // Set a short billing interval for quick expiration
      const amount = 1000;
      const billingInterval = 1;
      await subscription.setLenderParams(0, amount, billingInterval);
      await subscription.connect(accounts[1]).paySubscription(0, { value: amount });
      // Increase EVM time
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine", []);
      await subscription.revokeSubscription(0, accounts[1].address);
      const nextDueDate = await subscription.getSubscription(0, accounts[1].address);
      expect(nextDueDate).to.equal(0);
    });
  });
});
