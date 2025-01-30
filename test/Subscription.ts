import { expect } from "chai";
import { createPublicClient, createWalletClient, http, parseEther, getContractAt } from "viem";
import { hardhat } from "viem/chains";
import { deployContract } from "hardhat-deploy-ethers";

import SubscriptionABI from "../artifacts/contracts/Subscription.sol/Subscription.json";

describe("Subscription Contract", function () {
    let subscription: any;
    let owner: any, lender: any, borrower: any, other: any;
    let client: any, walletClient: any;

    beforeEach(async function () {
        // Obtener cuentas de Hardhat
        const accounts = await import("hardhat").then((h) => h.ethers.getSigners());
        [owner, lender, borrower, other] = accounts.map(acc => acc.address);

        // Configurar el cliente Viem
        client = createPublicClient({
            chain: hardhat,
            transport: http(),
        });

        walletClient = createWalletClient({
            chain: hardhat,
            transport: http(),
            account: lender,
        });

        // Desplegar el contrato usando Viem
        const SubscriptionFactory = await import("hardhat").then((h) => h.ethers.getContractFactory("Subscription"));
        subscription = await SubscriptionFactory.deploy(owner);

        // Conectar el contrato con Viem
        subscription = getContractAt({
            address: subscription.address,
            abi: SubscriptionABI.abi,
            publicClient: client,
            walletClient,
        });

        // Mint de un token al lender
        await subscription.write.safeMint([lender, "https://example.com/token-metadata"]);

        // Configuración del préstamo
        await subscription.write.setLenderParams([0, parseEther("1"), 86400]); // 1 ETH cada 24h
    });

    it("Debe permitir a un usuario mintear un NFT", async function () {
        const ownerOfToken = await subscription.read.ownerOf([0]);
        expect(ownerOfToken).to.equal(lender);
    });

    it("Debe permitir al propietario prestar el NFT a un prestatario", async function () {
        await subscription.write.lendToBorrower([0, borrower]);

        const [actualBorrower, nextDueDate] = await subscription.read.getActiveSubscription([0]);
        expect(actualBorrower).to.equal(borrower);
        expect(Number(nextDueDate)).to.be.greaterThan(0);
    });

    it("Debe permitir a un prestatario pagar la suscripción", async function () {
        await subscription.write.lendToBorrower([0, borrower]);

        await subscription.write.paySubscription([0], {
            value: parseEther("1"),
        });

        const [, nextDueDate] = await subscription.read.getActiveSubscription([0]);
        expect(Number(nextDueDate)).to.be.greaterThan(0);
    });

    it("Debe evitar que otro usuario pague la suscripción", async function () {
        await subscription.write.lendToBorrower([0, borrower]);

        await expect(
            subscription.write.paySubscription([0], {
                account: other,
                value: parseEther("1"),
            })
        ).to.be.rejectedWith("Not the borrower");
    });

    it("Debe evitar pagos con monto incorrecto", async function () {
        await subscription.write.lendToBorrower([0, borrower]);

        await expect(
            subscription.write.paySubscription([0], {
                value: parseEther("0.5"),
            })
        ).to.be.rejectedWith("Incorrect payment amount");
    });

    it("Debe permitir revocar una suscripción vencida", async function () {
        await subscription.write.lendToBorrower([0, borrower]);

        // Avanza el tiempo para que la suscripción expire
        await import("hardhat").then((h) => h.network.provider.send("evm_increaseTime", [86500]));
        await import("hardhat").then((h) => h.network.provider.send("evm_mine"));

        await subscription.write.revokeSubscription([0]);

        const [actualBorrower] = await subscription.read.getActiveSubscription([0]);
        expect(actualBorrower).to.equal("0x0000000000000000000000000000000000000000");
    });

    it("Debe evitar que un prestamista transfiera un NFT con suscripción activa", async function () {
        await subscription.write.lendToBorrower([0, borrower]);

        await expect(
            subscription.write.transferFrom([lender, other, 0])
        ).to.be.rejectedWith("Subscription active: cannot transfer");
    });
});
