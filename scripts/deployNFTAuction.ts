import hre from "hardhat";

async function main() {
  const nftSellerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Tu dirección NFT

  const nftAuction = await hre.viem.deployContract("NFTAuction", [nftSellerAddress]);

  console.log(`NFTAuction desplegado en: ${nftAuction.address}`);

  // Esperar para la verificación
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Verificar el contrato
  await hre.run("verify:verify", {
    address: nftAuction.address,
    constructorArguments: [nftSellerAddress],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});