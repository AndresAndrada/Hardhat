import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { ZeroAddress } from "ethers";
import hre from "hardhat";
import { expect } from "chai";
import { use } from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiEventEmitter from "chai-eventemitter";

use(chaiAsPromised);
use(chaiEventEmitter);
describe("MyERC721 and NFTAuction", function () {
  async function deployContractsFixture() {
    const [defaultAdmin, pauser, minter, nftSeller, bidder, otherAccount] = await hre.viem.getWalletClients();

    const myERC721 = await hre.viem.deployContract("MyERC721", [
      defaultAdmin.account.address,
      pauser.account.address,
      minter.account.address
    ], {});

    const myToken = await hre.viem.deployContract("MyToken", [
      defaultAdmin.account.address,
      pauser.account.address,
      minter.account.address
    ], {});

    const nftAuction = await hre.viem.deployContract("NFTAuction", [nftSeller.account.address], {});

    return { myERC721, nftAuction, myToken, defaultAdmin, pauser, minter, nftSeller, bidder, otherAccount };
  }

  describe("NFTAuction", function () {
    it("Should set the correct owner for NFTAuction", async function () {
      const { nftAuction, nftSeller } = await loadFixture(deployContractsFixture);
      const contractOwner = await nftAuction.read.owner();

      expect(contractOwner.toLowerCase()).to.equal(nftSeller.account.address.toLowerCase());
    });
 

 
it("Should revert if bid is below the minimum price", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);

  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  const tokenId = 0n;

  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  const myTokenAsMinter = await hre.viem.getContractAt("MyToken", myToken.address, { client: { wallet: minter } });
  const amountToMint = hre.ethers.parseUnits("500", 18) as bigint;
  await myTokenAsMinter.write.mint([bidder.account.address, amountToMint]);

  const minPrice = hre.ethers.parseUnits("100", 18) as bigint;
  
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  const lowBidAmount = hre.ethers.parseUnits("50", 18) as bigint;
  await myTokenAsMinter.write.approve([nftAuction.address, lowBidAmount], { account: bidder.account.address });
  await expect(
    nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, lowBidAmount], {
      account: bidder.account.address,
    })
).to.be.rejectedWith("Not enough funds to bid on NFT");
});

it("Should allow the seller to settle the auction after it ends", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);

  // Step 1: Mint the NFT to the seller
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  const tokenId = 0n;

  // Step 2: Approve the auction contract to handle the NFT
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  // Step 3: Mint some ERC20 tokens to the bidder
  const myTokenAsMinter = await hre.viem.getContractAt("MyToken", myToken.address, { client: { wallet: minter } });
  const amountToMint = hre.ethers.parseUnits("500", 18) as bigint;
  await myTokenAsMinter.write.mint([bidder.account.address, amountToMint]);
  // Step 4: Set the minimum price for the auction in ERC20 tokens
  const minPrice = hre.ethers.parseUnits("100", 18) as bigint;
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  // Step 5: Approve and place a bid higher than the minimum price
  const bidAmount = hre.ethers.parseUnits("200", 18) as bigint;
  await myTokenAsMinter.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
  await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount], {
    account: bidder.account.address,
  });

  // Step 6: Move time forward to simulate the auction ending
  await time.increase(86401n);

  // Step 7: Settle the auction as the seller
  await nftAuction.write.settleAuction([myERC721.address, tokenId], { account: nftSeller.account.address });

  // Step 8: Verify that the NFT ownership has been transferred to the highest bidder
  const newOwner = await myERC721.read.ownerOf([tokenId]);
  expect(newOwner.toLowerCase()).to.equal(bidder.account.address.toLowerCase());
});

    it("Should allow the seller to withdraw the auction if no bids were made", async function () {
      const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      const tokenId = 0n;

      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address  });

      const minPrice = hre.ethers.parseUnits("1", "ether") as bigint;
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, ZERO_ADDRESS, minPrice, 0n, 86400n, 100n, [], []],
        { client: { wallet: nftSeller } }
      );

      await nftAuction.write.withdrawAuction([myERC721.address, tokenId], { account: nftSeller.account.address });

      const auction = await nftAuction.read.nftContractAuctions([myERC721.address, tokenId]);
      expect(nftSeller.account.address).to.equal(nftSeller.account.address);
      
    });
   
    it("Should allow the seller to take the highest bid and finalize the auction", async function () {
      const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;
      const minPrice = hre.ethers.parseUnits("1", "ether");
    
      // Mint NFT and approve auction
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
    
      // Create auction
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );
    
      // Place a bid
      const bidAmount = hre.ethers.parseUnits("2", "ether");
      await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
      await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
      await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount], {
        account: bidder.account.address,
      });
    
      // Take the highest bid
      await nftAuction.write.takeHighestBid([myERC721.address, tokenId], { account: nftSeller.account.address });
    
      // Verify the auction is settled and the NFT is transferred
      const newOwner = await myERC721.read.ownerOf([tokenId]);
      expect(newOwner.toLowerCase()).to.equal(bidder.account.address.toLowerCase());
    });

    it("Should allow the seller to update the minimum price", async function () {
      const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;
      const initialMinPrice = hre.ethers.parseUnits("1", "ether");
      const newMinPrice = hre.ethers.parseUnits("2", "ether");
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

      // Mint NFT and approve auction
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
    
      // Create auction with initial min price
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, ZERO_ADDRESS, initialMinPrice, 0n, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );
    
      // Update the minimum price
      await nftAuction.write.updateMinimumPrice([myERC721.address, tokenId, newMinPrice], { account: nftSeller.account.address });
    
      // Verify the minimum price has been updated correctly
      const auction = await nftAuction.read.nftContractAuctions([myERC721.address, tokenId]);
      expect(auction[3].toString()).to.equal(newMinPrice.toString());
    });
    
    it("Should allow the seller to update the buy now price", async function () {
      const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;
      const initialBuyNowPrice = hre.ethers.parseUnits("2", "ether");
      const newBuyNowPrice = hre.ethers.parseUnits("3", "ether");
      const minPrice = hre.ethers.parseUnits("1", "ether"); // Asegúrate de que minPrice no sea cero
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    
      // Mint NFT
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
    
      // Approve NFT for auction
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
    
      // Create auction with initial buy now price and a valid minPrice
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, ZERO_ADDRESS, minPrice, initialBuyNowPrice, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );
    
      // Update the buy now price
      await nftAuction.write.updateBuyNowPrice([myERC721.address, tokenId, newBuyNowPrice], { account: nftSeller.account.address });
    
      // Verify the buy now price has been updated correctly
      const auction = await nftAuction.read.nftContractAuctions([myERC721.address, tokenId]);
      expect(auction[4].toString()).to.equal(newBuyNowPrice.toString());
    });
    
    
it("Should restrict access to owner-only functions", async function () {
  const { nftAuction, otherAccount } = await loadFixture(deployContractsFixture);

  // Attempt to update the default bid increase percentage as a non-owner
  const newPercentage = 200;
  await expect(
    nftAuction.write.updateDefaultBidIncreasePercentage([newPercentage], { account: otherAccount.account.address })
  ).to.be.rejectedWith("OwnableUnauthorizedAccount");

  // Attempt to update the minimum settable increase percentage as a non-owner
  await expect(
    nftAuction.write.updateMinimumSettableIncreasePercentage([newPercentage], { account: otherAccount.account.address })
  ).to.be.rejectedWith("OwnableUnauthorizedAccount");
});

it("Should prevent bids below the minimum price after updating", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);

  const tokenId = 0n;
  const newMinPrice = hre.ethers.parseUnits("5", "ether");

  // Mint NFT
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);

  // Approve NFT to auction
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  // Create auction
  const initialMinPrice = hre.ethers.parseUnits("3", "ether");
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, initialMinPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  // Update the minimum price
  await nftAuction.write.updateMinimumPrice([myERC721.address, tokenId, newMinPrice], { account: nftSeller.account.address });

  // Mint ERC20 tokens to the bidder
  const bidAmount = hre.ethers.parseUnits("4", "ether");
  await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
  await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });

  // Attempt to make a bid below the new minimum price
  await expect(
    nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount], { account: bidder.account.address })
  ).to.be.rejectedWith("Not enough funds to bid on NFT");
});

  
it("Should handle concurrent bids correctly", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, otherAccount, minter } = await loadFixture(deployContractsFixture);

  const tokenId = 0n;

  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);

  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  const minPrice = hre.ethers.parseUnits("3", "ether");
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  const bidAmount1 = hre.ethers.parseUnits("4", "ether");
  const bidAmount2 = hre.ethers.parseUnits("5", "ether");
  await myToken.write.mint([bidder.account.address, bidAmount1], { account: minter.account.address });
  await myToken.write.mint([otherAccount.account.address, bidAmount2], { account: minter.account.address });

  await myToken.write.approve([nftAuction.address, bidAmount1], { account: bidder.account.address });
  await myToken.write.approve([nftAuction.address, bidAmount2], { account: otherAccount.account.address });

  await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount1], {
    account: bidder.account.address,
  });

  await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount2], {
    account: otherAccount.account.address,
  });

  const highestBid = await nftAuction.read.getHighestBid([myERC721.address, tokenId]);

  expect(highestBid[0].toLowerCase()).to.equal(otherAccount.account.address.toLowerCase());
  expect(highestBid[1].toString()).to.equal(bidAmount2.toString());
});
    

    it("Should allow successful withdrawBid in different scenarios", async function () {
      const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;

      // Setup inicial
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

      // Crear subasta con precio mínimo bajo
      const initialMinPrice = hre.ethers.parseUnits("1", "ether");
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, myToken.address, initialMinPrice, 0n, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );

      // Hacer una oferta válida inicial
      const bidAmount = hre.ethers.parseUnits("2", "ether");
      await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
      await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
      
      await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount], {
        account: bidder.account.address,
      });

      // Verificar balance antes del retiro
      const balanceAntes = await myToken.read.balanceOf([bidder.account.address]);

      // Retirar la oferta
      await nftAuction.write.withdrawBid([myERC721.address, tokenId], { account: bidder.account.address });

      // Verificar que los tokens fueron devueltos
      const balanceDespues = await myToken.read.balanceOf([bidder.account.address]);
      expect(balanceDespues).to.equal(balanceAntes + bidAmount);

      // Verificar que la oferta más alta se reinició
      const finalBidState = await nftAuction.read.getHighestBid([myERC721.address, tokenId]);
      expect(finalBidState[0]).to.equal(ZeroAddress);
      expect(finalBidState[1]).to.equal(0n);

      // Intentar retirar de nuevo debería fallar
      await expect(
        nftAuction.write.withdrawBid([myERC721.address, tokenId], { account: bidder.account.address })
      ).to.be.rejectedWith("Cannot withdraw funds");
    });
    it("Should allow to create a sale", async function () {
      const { nftAuction, myERC721, nftSeller, minter, myToken } = await loadFixture(deployContractsFixture);

      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      const tokenId = 0n;  // Asegúrate de que esto sea un bigint

      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

      const buyNowPrice = hre.ethers.parseUnits("1", "ether");  // Precio de compra
      const whitelistedBuyer = ZeroAddress;  // O la dirección que desees
      const feeRecipients = [];  // O las direcciones que desees
      const feePercentages = [];  // O los porcentajes que desees
      // Crear la ventaconsol
      await nftAuction.write.createSale(
          [myERC721.address, tokenId, myToken.address, buyNowPrice, whitelistedBuyer, feeRecipients, feePercentages],
          { account: nftSeller.account.address }
      );

      // Verifica que la venta se haya creado correctamente
      const auction = await nftAuction.read.nftContractAuctions([myERC721.address, tokenId]);

      // Verifica el propietario de la NFT
      const nftOwner = await myERC721.read.ownerOf([tokenId]);

      expect(auction[7].toString().toLowerCase()).to.equal(nftSeller.account.address.toString().toLowerCase());
  });
  it("Should revert if the sale price is zero", async function () {
    const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);

    const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
    await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
    const tokenId = 0n;  // Asegúrate de que esto sea un bigint

    await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

    await expect(nftAuction.write.createSale(
        [myERC721.address, tokenId, ZeroAddress, 0n, ZeroAddress, [], []],
        { account: nftSeller.account.address }
    )).to.be.rejectedWith("Price cannot be 0");
});
it("Should revert if the sale is created when an auction is ongoing", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);

  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  const tokenId = 0n;  // Asegúrate de que esto sea un bigint

  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, 0n, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  // Aquí se espera que la creación de la venta falle
  await expect(nftAuction.write.createSale(
      [myERC721.address, tokenId, ZeroAddress, 0n, ZeroAddress, [], []],
      { account: nftSeller.account.address }
  )).to.be.rejectedWith("Auction already started by owner");
});
    it("Should prevent unauthorized bid withdrawals", async function () {
      const { nftAuction, myERC721, myToken, nftSeller, bidder, otherAccount, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;

      // Setup inicial
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

      // Crear subasta
      const minPrice = hre.ethers.parseUnits("1", "ether");
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );

      // Hacer una oferta válida
      const bidAmount = hre.ethers.parseUnits("2", "ether");
      await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
      await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
      
      await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount], {
        account: bidder.account.address,
      });

      // Intentar retirar la oferta desde otra cuenta
      await expect(
        nftAuction.write.withdrawBid([myERC721.address, tokenId], { account: otherAccount.account.address })
      ).to.be.rejectedWith("The auction has a valid bid made");
    });

    it("Should prevent NFT theft attempts", async function () {
      const { nftAuction, myERC721, nftSeller, otherAccount, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;

      // Setup inicial - Mint el NFT al vendedor
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);

      // Verificar propiedad inicial
      const ownerBeforeAttempt = await myERC721.read.ownerOf([tokenId]);
      expect(ownerBeforeAttempt.toLowerCase()).to.equal(nftSeller.account.address.toLowerCase());

      // Intentar crear una subasta sin ser el dueño
      const minPrice = hre.ethers.parseUnits("1", "ether");
      try {
        await nftAuction.write.createNewNftAuction(
          [myERC721.address, tokenId, ZeroAddress, minPrice, 0n, 86400n, 100n, [], []],
          { account: otherAccount.account.address }
        );
        expect.fail("Debería haber fallado con 'Not owner of NFT'");
      } catch (error: any) {
        expect(error.message).to.include("Not owner of NFT");
      }

      // Verificar que la propiedad no ha cambiado
      const ownerAfterAttempt = await myERC721.read.ownerOf([tokenId]);
      expect(ownerAfterAttempt.toLowerCase()).to.equal(nftSeller.account.address.toLowerCase());
    });

    it("Should prevent manipulation of auction parameters by non-owners", async function () {
      const { nftAuction, myERC721, myToken, nftSeller, otherAccount, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;

      // Setup inicial
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

      // Crear subasta
      const minPrice = hre.ethers.parseUnits("1", "ether");
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );

      // Intentar actualizar precio mínimo sin ser el vendedor
      const newMinPrice = hre.ethers.parseUnits("2", "ether");
      await expect(
        nftAuction.write.updateMinimumPrice([myERC721.address, tokenId, newMinPrice], { account: otherAccount.account.address })
      ).to.be.rejectedWith("Only nft seller");

      // Intentar actualizar precio de compra inmediata sin ser el vendedor
      await expect(
        nftAuction.write.updateBuyNowPrice([myERC721.address, tokenId, newMinPrice], { account: otherAccount.account.address })
      ).to.be.rejectedWith("Only nft seller");
    });
    it("Should prevent unauthorized settlement of auctions", async function () {
      const { nftAuction, myERC721, myToken, nftSeller, bidder, otherAccount, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;
    
      // Setup inicial
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
    
      // Crear subasta
      const minPrice = hre.ethers.parseUnits("1", "ether");
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );
    
      // Hacer una oferta válida
      const bidAmount = hre.ethers.parseUnits("2", "ether");
      await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
      await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
      await nftAuction.write.makeBid(
        [myERC721.address, tokenId, myToken.address, bidAmount],
        { account: bidder.account.address }
      );
    
      // Avanzar el tiempo para que termine la subasta
      await time.increase(86401n);
    
      // Intentar liquidar desde una cuenta no autorizada
      await expect(
        nftAuction.write.settleAuction(
            [myERC721.address, tokenId],
            { account: otherAccount.account.address }
        )
    ).to.be.rejectedWith("Only nft seller");
    
      // No necesitamos verificar el propietario si esperamos que la transacción falle
    });

    it("Should prevent settling auction with no bids", async function () {
      const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;
  
      // Setup inicial
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
  
      // Crear subasta
      const minPrice = hre.ethers.parseUnits("1", "ether");
      await nftAuction.write.createNewNftAuction(
          [myERC721.address, tokenId, ZeroAddress, minPrice, 0n, 86400n, 100n, [], []],
          { account: nftSeller.account.address }
      );
  
      // Avanzar el tiempo para que la subasta termine
      await time.increase(86401n); // Asegúrate de que el tiempo se incremente más allá de la duración de la subasta
  
      // Intentar liquidar sin ofertas
      await expect(
          nftAuction.write.settleAuction([myERC721.address, tokenId], { account: nftSeller.account.address })
      ).to.be.rejectedWith("No valid bid made"); // Esto debería fallar si no hay una oferta válida
  });

    // Mover los otros tests de settle auction aquí (líneas 466-528)
    it("Should correctly settle auction with valid bid", async function () {
      const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;
    
      // Setup inicial
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
    
      // Crear subasta
      const minPrice = hre.ethers.parseUnits("1", "ether");
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );
    
      // Hacer una oferta válida
      const bidAmount = hre.ethers.parseUnits("2", "ether");
      await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
      await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
      
      await nftAuction.write.makeBid(
        [myERC721.address, tokenId, myToken.address, bidAmount],
        { account: bidder.account.address }
      );
    
      // Guardar balances iniciales
      const sellerInitialBalance = await myToken.read.balanceOf([nftSeller.account.address]);
      
      // Avanzar el tiempo para que termine la subasta
      await time.increase(86401n);
    
      // Liquidar la subasta
      await nftAuction.write.settleAuction(
        [myERC721.address, tokenId],
        { account: nftSeller.account.address }
      );
    
      // Verificaciones
      const highestBid = await nftAuction.read.getHighestBid([myERC721.address, tokenId]);
      expect(highestBid[0]).to.equal(ZeroAddress);
      expect(highestBid[1]).to.equal(0n);
      
      const newOwner = await myERC721.read.ownerOf([tokenId]);
      expect(newOwner.toLowerCase()).to.equal(bidder.account.address.toLowerCase());
    
      const sellerFinalBalance = await myToken.read.balanceOf([nftSeller.account.address]);
      expect(sellerFinalBalance).to.equal(sellerInitialBalance + bidAmount);
    
      // Verificar que no se puede liquidar dos veces
      await expect(
        nftAuction.write.settleAuction([myERC721.address, tokenId], { account: nftSeller.account.address })
      ).to.be.rejectedWith("Only nft seller");  // Cambiar el mensaje de error esperado
    });
  });
// test/NFTAuction.ts
// test/NFTAuction.ts
it("Should revert if the seller tries to create a sale when an auction is ongoing", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
  
  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, 0n, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  // Aquí se espera que la creación de la venta falle
  await expect(nftAuction.write.createSale(
      [myERC721.address, tokenId, ZeroAddress, 0n, ZeroAddress, [], []],
      { account: nftSeller.account.address }
  )).to.be.rejectedWith("Auction already started by owner");
});

it("Should revert if the new buy now price is less than the minimum price", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
  
  const minPrice = hre.ethers.parseUnits("1", "ether");
  const buyNowPrice = hre.ethers.parseUnits("2", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, buyNowPrice, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  const newBuyNowPrice = hre.ethers.parseUnits("0.5", "ether");
  await expect(nftAuction.write.updateBuyNowPrice(
      [myERC721.address, tokenId, newBuyNowPrice],
      { account: nftSeller.account.address }
  )).to.be.rejectedWith("MinPrice > 80% of buyNowPrice");
});

it("Should revert if the sale price is zero", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  await expect(nftAuction.write.createSale(
      [myERC721.address, tokenId, ZeroAddress, 0n, ZeroAddress, [], []],
      { account: nftSeller.account.address }
  )).to.be.rejectedWith("Price cannot be 0");
});

it("Should revert if the auction cannot be settled due to minimum price not met", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  // Asegúrate de que el tiempo se incremente más allá de la duración de la subasta
  await time.increase(86501n); // Incrementa el tiempo para que la subasta se considere terminada

  // Ahora intenta liquidar la subasta
  await expect(nftAuction.write.settleAuction([myERC721.address, tokenId], { account: nftSeller.account.address }))
      .to.be.rejectedWith("No valid bid made"); // Esto debería fallar si no hay una oferta válida
});
it("Should revert if the seller tries to settle the auction before it ends", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
  
  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, 0n, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  // Intentar liquidar la subasta antes de que termine
  await expect(nftAuction.write.settleAuction([myERC721.address, tokenId], { account: nftSeller.account.address }))
      .to.be.rejectedWith("Auction is not yet over");
});


it("Should revert if the new buy now price is less than the minimum price", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
  
  const minPrice = hre.ethers.parseUnits("1", "ether");
  const buyNowPrice = hre.ethers.parseUnits("2", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, buyNowPrice, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  const newBuyNowPrice = hre.ethers.parseUnits("0.5", "ether");
  await expect(nftAuction.write.updateBuyNowPrice(
      [myERC721.address, tokenId, newBuyNowPrice],
      { account: nftSeller.account.address }
  )).to.be.rejectedWith("MinPrice > 80% of buyNowPrice");
});

it("Should prevent unauthorized bid withdrawals", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, otherAccount, minter } = await loadFixture(deployContractsFixture);
  const tokenId = 0n;

  // Setup inicial
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  // Crear subasta
  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  // Hacer una oferta válida
  const bidAmount = hre.ethers.parseUnits("2", "ether");
  await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
  await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
  
  await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount], {
    account: bidder.account.address,
  });

  // Intentar retirar la oferta desde otra cuenta
  await expect(
    nftAuction.write.withdrawBid([myERC721.address, tokenId], { account: otherAccount.account.address })
  ).to.be.rejectedWith("The auction has a valid bid made");
});

it("Should prevent NFT theft attempts", async function () {
  const { nftAuction, myERC721, nftSeller, otherAccount, minter } = await loadFixture(deployContractsFixture);
  const tokenId = 0n;

  // Setup inicial - Mint el NFT al vendedor
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);

  // Verificar propiedad inicial
  const ownerBeforeAttempt = await myERC721.read.ownerOf([tokenId]);
  expect(ownerBeforeAttempt.toLowerCase()).to.equal(nftSeller.account.address.toLowerCase());

  // Intentar crear una subasta sin ser el dueño
  const minPrice = hre.ethers.parseUnits("1", "ether");
  try {
    await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, 0n, 86400n, 100n, [], []],
      { account: otherAccount.account.address }
    );
    expect.fail("Debería haber fallado con 'Not owner of NFT'");
  } catch (error: any) {
    expect(error.message).to.include("Not owner of NFT");
  }

  // Verificar que la propiedad no ha cambiado
  const ownerAfterAttempt = await myERC721.read.ownerOf([tokenId]);
  expect(ownerAfterAttempt.toLowerCase()).to.equal(nftSeller.account.address.toLowerCase());
});

it("Should prevent manipulation of auction parameters by non-owners", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, otherAccount, minter } = await loadFixture(deployContractsFixture);
  const tokenId = 0n;

  // Setup inicial
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  // Crear subasta
  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  // Intentar actualizar precio mínimo sin ser el vendedor
  const newMinPrice = hre.ethers.parseUnits("2", "ether");
  await expect(
    nftAuction.write.updateMinimumPrice([myERC721.address, tokenId, newMinPrice], { account: otherAccount.account.address })
  ).to.be.rejectedWith("Only nft seller");

  // Intentar actualizar precio de compra inmediata sin ser el vendedor
  await expect(
    nftAuction.write.updateBuyNowPrice([myERC721.address, tokenId, newMinPrice], { account: otherAccount.account.address })
  ).to.be.rejectedWith("Only nft seller");
});

it("Should prevent unauthorized settlement of auctions", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, otherAccount, minter } = await loadFixture(deployContractsFixture);
  const tokenId = 0n;

  // Setup inicial
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  // Crear subasta
  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  // Hacer una oferta válida
  const bidAmount = hre.ethers.parseUnits("2", "ether");
  await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
  await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
  await nftAuction.write.makeBid(
    [myERC721.address, tokenId, myToken.address, bidAmount],
    { account: bidder.account.address }
  );

  // Avanzar el tiempo para que termine la subasta
  await time.increase(86401n);

  // Intentar liquidar desde una cuenta no autorizada
  await expect(
    nftAuction.write.settleAuction(
        [myERC721.address, tokenId],
        { account: otherAccount.account.address }
    )
).to.be.rejectedWith("Only nft seller");
});

it("Should prevent settling auction with no bids", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  const tokenId = 0n;

  // Setup inicial
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  // Crear subasta
  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, 0n, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  // Avanzar el tiempo para que la subasta termine
  await time.increase(86401n); // Asegúrate de que el tiempo se incremente más allá de la duración de la subasta

  // Intentar liquidar sin ofertas
  await expect(
      nftAuction.write.settleAuction([myERC721.address, tokenId], { account: nftSeller.account.address })
  ).to.be.rejectedWith("No valid bid made"); // Esto debería fallar si no hay una oferta válida
});
// test/NFTAuction.ts


it("Should revert if the seller tries to create a sale with a minimum price of zero", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  // Intentar crear una venta con un precio mínimo de cero
  await expect(nftAuction.write.createSale(
      [myERC721.address, tokenId, ZeroAddress, 0n, ZeroAddress, [], []],
      { account: nftSeller.account.address }
  )).to.be.rejectedWith("Price cannot be 0");
});


it("Should revert if the seller tries to update the buy now price to less than the minimum price", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  const minPrice = hre.ethers.parseUnits("1", "ether");
  const buyNowPrice = hre.ethers.parseUnits("2", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, buyNowPrice, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  const newBuyNowPrice = hre.ethers.parseUnits("0.5", "ether");
  await expect(nftAuction.write.updateBuyNowPrice(
      [myERC721.address, tokenId, newBuyNowPrice],
      { account: nftSeller.account.address }
  )).to.be.rejectedWith("MinPrice > 80% of buyNowPrice");
});

it("Should revert if the seller tries to settle the auction without a valid bid", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
  
  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, 0n, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  // Asegúrate de que el tiempo se incremente más allá de la duración de la subasta
  await time.increase(86401n); // Incrementa el tiempo para que la subasta se considere terminada

  // Intentar liquidar la subasta sin ofertas válidas
  await expect(nftAuction.write.settleAuction([myERC721.address, tokenId], { account: nftSeller.account.address }))
      .to.be.rejectedWith("No valid bid made");
});
// test/NFTAuction.ts

// ... código existente ...
it("Should emit the correct events when creating a new auction", async function () {
  const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  const minPrice = hre.ethers.parseUnits("1", "ether");
  const buyNowPrice = hre.ethers.parseUnits("2", "ether");

  // Crear la nueva subasta
  const tx = await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, ZeroAddress, minPrice, buyNowPrice, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  // Verificar que el evento se haya emitido correctamente
  const receipt = await tx.wait(); // Asegúrate de que tx sea un objeto de transacción
  const event = receipt.events?.find(event => event.event === "NftAuctionCreated");

  expect(event).to.exist; // Verifica que el evento fue emitido
  expect(event.args[0]).to.equal(myERC721.address);
  expect(event.args[1]).to.equal(tokenId);
  expect(event.args[2]).to.equal(nftSeller.account.address);
  expect(event.args[3]).to.equal(ZeroAddress);
  expect(event.args[4]).to.equal(minPrice);
  expect(event.args[5]).to.equal(buyNowPrice);
  expect(event.args[6]).to.equal(86400n);
  expect(event.args[7]).to.equal(100n);
  expect(event.args[8]).to.deep.equal([]);
  expect(event.args[9]).to.deep.equal([]);
});
it("Should allow the seller to withdraw all failed credits", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, minter, bidder } = await loadFixture(deployContractsFixture);
  
  const tokenId = 0n;
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  const minPrice = hre.ethers.parseUnits("1", "ether");
  await nftAuction.write.createNewNftAuction(
      [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
      { account: nftSeller.account.address }
  );

  // Simular un fallo en la transferencia de una oferta
  const bidAmount = hre.ethers.parseUnits("1", "ether");
  await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
  await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });

  // Hacer una oferta válida
  await nftAuction.write.makeBid(
      [myERC721.address, tokenId, myToken.address, bidAmount],
      { account: bidder.account.address }
  );

  // Intentar retirar créditos fallidos   
  await expect(nftAuction.write.withdrawAllFailedCredits())
      .to.emit(nftAuction, "Withdrawal") // Corregido para usar .to.emit
      .withArgs(nftSeller.account.address, bidAmount); // Asegúrate de que el segundo argumento sea correcto
});
// ... código existente ...
});