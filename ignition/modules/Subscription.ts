import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SubscriptionModule = buildModule("Subscription", (m) => {
  const nftSellerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  const defaultAdmin = nftSellerAddress;

  console.log("defaultAdmin", defaultAdmin);

  const subscription = m.contract("Subscription", [defaultAdmin]);

  return { subscription };
});

export default SubscriptionModule;
