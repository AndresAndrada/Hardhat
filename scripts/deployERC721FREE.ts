import hre from "hardhat";

async function main() {
  // Replace with the desired addresses for deployment
  const defaultAdminAddress = "0xE35A435475fec63D827420bd4041b49b965B5522"; // Example address
  const pauserAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";       // Example address
  const minterAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";       // Example address

  const erc721Free = await hre.viem.deployContract("ERC721FREE", [
    defaultAdminAddress,
  ]);

  console.log(`ERC721FREE deployed to: ${erc721Free.address}`);

  // Wait for 30 seconds for Etherscan to index the transaction
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Verify the contract on Etherscan
  // Ensure you have set up your Etherscan API key in hardhat.config.ts
  await hre.run("verify:verify", {
    address: erc721Free.address,
    constructorArguments: [
      defaultAdminAddress,
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
