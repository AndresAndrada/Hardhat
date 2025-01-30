import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { parseUnits } from "viem";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import hre from "hardhat";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiEventEmitter from "chai-eventemitter";

use(chaiAsPromised);
use(chaiEventEmitter);

describe("Subscription", function () {
  /**
   * Fixture para desplegar el contrato y obtener direcciones de test.
   * Esto se ejecuta una sola vez para todos los tests que usan loadFixture().
   */
  async function deploySubscriptionFixture() {
    const [owner, user1, user2, borrower, otherAccount] = await hre.viem.getWalletClients();

    // Desplegamos el contrato Subscription, pasando el "owner" en el constructor
    const subscription = await hre.viem.deployContract("Subscription", [owner.account.address], {});

    return { subscription, owner, user1, user2, borrower, otherAccount };
  }

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      const { subscription, owner } = await loadFixture(deploySubscriptionFixture);

      const contractOwner = await subscription.read.owner();
      expect(contractOwner.toLowerCase()).to.equal(owner.account.address.toLowerCase());
    });
  });

  describe("Pause / Unpause", function () {
    it("Should allow the owner to pause the contract", async function () {
      const { subscription, owner } = await loadFixture(deploySubscriptionFixture);

      // Pausamos el contrato
      await subscription.write.pause([], { account: owner.account.address });

      // Intentamos mintear para verificar que está pausado
      await expect(
        subscription.write.safeMint([owner.account.address, "ipfs://token"], { account: owner.account.address })
      ).to.be.rejectedWith("Pausable: paused");
    });

    it("Should allow the owner to unpause the contract", async function () {
      const { subscription, owner } = await loadFixture(deploySubscriptionFixture);

      // Pausamos el contrato
      await subscription.write.pause([], { account: owner.account.address });
      // Despausamos
      await subscription.write.unpause([], { account: owner.account.address });

      // Debería permitir mintear ahora
      await expect(
        subscription.write.safeMint([owner.account.address, "ipfs://token"], { account: owner.account.address })
      ).not.to.be.rejected;
    });

    it("Should revert if a non-owner tries to pause", async function () {
      const { subscription, user1 } = await loadFixture(deploySubscriptionFixture);

      await expect(subscription.write.pause([], { account: user1.account.address })).to.be.rejectedWith(
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("Minting (safeMint)", function () {
    it("Should allow anyone to mint by default (if that's the intended design)", async function () {
      const { subscription, user1 } = await loadFixture(deploySubscriptionFixture);

      const tx = await subscription.write.safeMint([user1.account.address, "ipfs://example-uri"], {
        account: user1.account.address,
      });

      // Verificamos que el token se minteó
      // Normalmente, el ID se autoincrementa desde 0
      const tokenId = 0n;
      const newOwner = await subscription.read.ownerOf([tokenId]);
      expect(newOwner.toLowerCase()).to.equal(user1.account.address.toLowerCase());
    });

    it("Should store the correct tokenURI", async function () {
      const { subscription, user1 } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://my-custom-uri"], {
        account: user1.account.address,
      });

      const uri = await subscription.read.tokenURI([tokenId]);
      expect(uri).to.equal("ipfs://my-custom-uri");
    });
  });

  describe("Setting Lender Params", function () {
    it("Should allow the NFT owner to set lender params", async function () {
      const { subscription, user1 } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      // user1 es dueño del token, por lo que puede setear los parámetros
      const amount = parseUnits("1", "ether");
      const interval = 86400n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });

      // Verificamos que se hayan guardado
      const [storedAmount, storedInterval] = await subscription.read.getLenderParams([tokenId]);
      expect(storedAmount).to.equal(amount);
      expect(storedInterval).to.equal(interval);
    });

    it("Should revert if a non-owner tries to set lender params", async function () {
      const { subscription, user1, otherAccount } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      const amount = parseUnits("1", "ether");
      const interval = 86400n;
      await expect(
        subscription.write.setLenderParams([tokenId, amount, interval], { account: otherAccount.account.address })
      ).to.be.rejectedWith("Not the token owner");
    });
  });

  describe("Lending to Borrower (lendToBorrower)", function () {
    it("Should allow the NFT owner to lend to a borrower if lender params are set", async function () {
      const { subscription, user1, borrower } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });
      // Seteamos lender params
      const amount = parseUnits("1", "ether");
      const interval = 86400n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });

      // Lend
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      const [activeBorrower, nextDueDate] = await subscription.read.getActiveSubscription([tokenId]);
      expect(activeBorrower.toLowerCase()).to.equal(borrower.account.address.toLowerCase());
      expect(nextDueDate).to.be.gt(0n);
    });

    it("Should revert if lender params are not set", async function () {
      const { subscription, user1, borrower } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      // Intentamos hacer lend sin setear params
      await expect(
        subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address })
      ).to.be.rejectedWith("Lender parameters not set");
    });

    it("Should revert if called by someone who is not the NFT owner", async function () {
      const { subscription, user1, user2, borrower } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      // Seteamos lender params como user1
      const amount = parseUnits("1", "ether");
      const interval = 86400n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });

      // user2 intenta prestar
      await expect(
        subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user2.account.address })
      ).to.be.rejectedWith("Not the token owner");
    });

    it("Should revert if the token is already lent", async function () {
      const { subscription, user1, borrower } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });
      const amount = parseUnits("1", "ether");
      const interval = 86400n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });

      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });
      // Intentamos prestar de nuevo
      await expect(
        subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address })
      ).to.be.rejectedWith("Already lent");
    });
  });

  describe("Paying the Subscription (paySubscription)", function () {
    it("Should allow the borrower to pay the subscription before due date", async function () {
      const { subscription, user1, borrower } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      const amount = parseUnits("1", "ether");
      const interval = 86400n;

      // Owner setea parámetros de lending
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });

      // Se lo presta a borrower
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      // borrower paga la suscripción
      await expect(
        subscription.write.paySubscription([tokenId], {
          account: borrower.account.address,
          value: amount,
        })
      ).not.to.be.rejected;

      // nextDueDate debe haberse incrementado
      const [, nextDueDate] = await subscription.read.getActiveSubscription([tokenId]);
      // Este nextDueDate debe ser block.timestamp + interval. 
      // Aquí solo revisamos que sea > block.timestamp
      expect(nextDueDate).to.be.gt(BigInt(await time.latest()));
    });

    it("Should revert if msg.value != amount", async function () {
      const { subscription, user1, borrower } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      const amount = parseUnits("1", "ether");
      const interval = 86400n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      // Intentar pagar con amount distinto
      await expect(
        subscription.write.paySubscription([tokenId], {
          account: borrower.account.address,
          value: parseUnits("0.5", "ether"),
        })
      ).to.be.rejectedWith("Incorrect payment amount");
    });

    it("Should revert if payment is late", async function () {
      const { subscription, user1, borrower } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      const amount = parseUnits("1", "ether");
      const interval = 3600n; // 1 hora
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      // Avanzamos el tiempo más allá del nextDueDate
      await time.increase(3601n);

      // Intentamos pagar
      await expect(
        subscription.write.paySubscription([tokenId], {
          account: borrower.account.address,
          value: amount,
        })
      ).to.be.rejectedWith("Payment is late");
    });

    it("Should revert if caller is not the borrower", async function () {
      const { subscription, user1, borrower, otherAccount } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      const amount = parseUnits("1", "ether");
      const interval = 86400n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      // otherAccount intenta pagar
      await expect(
        subscription.write.paySubscription([tokenId], {
          account: otherAccount.account.address,
          value: amount,
        })
      ).to.be.rejectedWith("Not the borrower");
    });
  });

  describe("Revoke Subscription (revokeSubscription)", function () {
    it("Should allow token owner to revoke after due date has passed", async function () {
      const { subscription, user1, borrower } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      const amount = parseUnits("1", "ether");
      const interval = 3600n; // 1 hora
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      // Avanzamos el tiempo para que la suscripción esté vencida
      await time.increase(3601n);

      await subscription.write.revokeSubscription([tokenId], { account: user1.account.address });

      const [activeBorrower] = await subscription.read.getActiveSubscription([tokenId]);
      expect(activeBorrower).to.equal(ZeroAddress);
    });

    it("Should revert if called by someone who is not the token owner", async function () {
      const { subscription, user1, borrower, otherAccount } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });
      const amount = parseUnits("1", "ether");
      const interval = 3600n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      // Avanzamos el tiempo
      await time.increase(3601n);

      await expect(
        subscription.write.revokeSubscription([tokenId], { account: otherAccount.account.address })
      ).to.be.rejectedWith("Not the token owner");
    });

    it("Should revert if the subscription is still active (not overdue)", async function () {
      const { subscription, user1, borrower } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });
      const amount = parseUnits("1", "ether");
      const interval = 86400n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      // Intentar revocar antes de que se cumpla el plazo
      await expect(
        subscription.write.revokeSubscription([tokenId], { account: user1.account.address })
      ).to.be.rejectedWith("Subscription still active");
    });
  });

  describe("Transfer with active subscription", function () {
    it("Should prevent transferring if subscription is still active", async function () {
      const { subscription, user1, borrower, otherAccount } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });
      const amount = parseUnits("1", "ether");
      const interval = 86400n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      // nextDueDate = block.timestamp + interval => sub está activa
      await expect(
        subscription.write["transferFrom(address,address,uint256)"](
          [user1.account.address, otherAccount.account.address, tokenId],
          { account: user1.account.address }
        )
      ).to.be.rejectedWith("Subscription active: cannot transfer");
    });

    it("Should allow transferring if subscription is not active (no borrower or overdue)", async function () {
      const { subscription, user1, otherAccount } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });

      // Aún no hay activeSubscription, por lo que la transferencia debería estar permitida
      await expect(
        subscription.write["transferFrom(address,address,uint256)"](
          [user1.account.address, otherAccount.account.address, tokenId],
          { account: user1.account.address }
        )
      ).not.to.be.rejected;

      const newOwner = await subscription.read.ownerOf([tokenId]);
      expect(newOwner.toLowerCase()).to.equal(otherAccount.account.address.toLowerCase());
    });

    it("Should allow transferring if subscription is overdue and fue revocada", async function () {
      const { subscription, user1, borrower, otherAccount } = await loadFixture(deploySubscriptionFixture);

      const tokenId = 0n;
      await subscription.write.safeMint([user1.account.address, "ipfs://uri"], { account: user1.account.address });
      const amount = parseUnits("1", "ether");
      const interval = 3600n;
      await subscription.write.setLenderParams([tokenId, amount, interval], { account: user1.account.address });
      await subscription.write.lendToBorrower([tokenId, borrower.account.address], { account: user1.account.address });

      // Avanzamos el tiempo para que esté vencida
      await time.increase(3601n);
      // Revocamos la suscripción
      await subscription.write.revokeSubscription([tokenId], { account: user1.account.address });

      // Ahora debe poder transferirse
      await subscription.write["transferFrom(address,address,uint256)"](
        [user1.account.address, otherAccount.account.address, tokenId],
        { account: user1.account.address }
      );

      const newOwner = await subscription.read.ownerOf([tokenId]);
      expect(newOwner.toLowerCase()).to.equal(otherAccount.account.address.toLowerCase());
    });
  });
});
