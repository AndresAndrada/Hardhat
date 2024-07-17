const Viem = require("viem");

// Configura el cliente Viem
const viemClient = new Viem.Client({
  url: "http://127.0.0.1:8545",
  wallet: {
    privateKey: "TU_CLAVE_PRIVADA",
  },
});
console.log(viemClient, "VIEM");

module.exports = viemClient;
