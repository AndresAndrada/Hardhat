import hre from "hardhat";

async function main() {
  const nftSellerAddress = "0xae4c91558844C38195D61388322f80617c0a717F";

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