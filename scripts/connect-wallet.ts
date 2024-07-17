const viemClientConfig = require("./viem-config");

(async () => {
  const address = await viemClientConfig.wallet.getAddress();
  console.log("Dirección de la billetera:", address);

  // Opcional: Verificar el balance de la billetera
  const balance = await viemClientConfig.wallet.getBalance();
  console.log("Balance:", balance.toString());
})();
