import { expect } from "chai";
import { ethers } from "hardhat";

describe("Subscription Contract", function () {
  let Subscription: any;
  let subscription: any;
  let owner: any, addr1: any, addr2: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Desplegamos el contrato pasando "owner.address" como initialOwner
    Subscription = await ethers.getContractFactory("Subscription");
    subscription = await Subscription.deploy(owner.address);
    await subscription.deployed();
  });

  it("Debe tener el nombre y símbolo correctos", async function () {
    expect(await subscription.name()).to.equal("Subscription");
    expect(await subscription.symbol()).to.equal("MTK");
  });

  it("Debe permitir hacer 'safeMint' de un nuevo token con URI", async function () {
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    expect(await subscription.ownerOf(0)).to.equal(addr1.address);
    expect(await subscription.tokenURI(0)).to.equal("uri-prueba");
  });

  it("Solo el propietario del token puede establecer parámetros de préstamo", async function () {
    // Mint del token para addr1
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // addr1 establece parámetros de préstamo
    await subscription.connect(addr1).setLenderParams(0, 1000, 3600); // 1 hora = 3600 seg
    const [amount, interval] = await subscription.getLenderParams(0);
    expect(amount).to.equal(1000);
    expect(interval).to.equal(3600);

    // addr2 intentando establecer parámetros en el token 0 debe revertir
    await expect(
      subscription.connect(addr2).setLenderParams(0, 500, 1800)
    ).to.be.revertedWith("Not the token owner");
  });

  it("Debe permitir al propietario del token prestar a un 'borrower' con parámetros configurados", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros
    await subscription.connect(addr1).setLenderParams(0, 1000, 3600);

    // Prestamos a borrower (addr2)
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);
    const [borrower, nextDueDate] = await subscription.getActiveSubscription(0);

    expect(borrower).to.equal(addr2.address);
    expect(nextDueDate).to.be.gt(0); // Debe ser > 0 si fue asignado correctamente
  });

  it("Debe revertir si el token ya fue prestado antes", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros
    await subscription.connect(addr1).setLenderParams(0, 1000, 3600);
    // Prestamos por primera vez
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);

    // Intentamos prestar nuevamente el mismo token
    await expect(
      subscription.connect(addr1).lendToBorrower(0, owner.address)
    ).to.be.revertedWith("Already lent");
  });

  it("Debe revertir si no se han configurado parámetros para un token antes de prestarlo", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Intentamos prestar sin setLenderParams
    await expect(
      subscription.connect(addr1).lendToBorrower(0, addr2.address)
    ).to.be.revertedWith("Lender parameters not set");
  });

  it("Debe permitir pagar la suscripción antes de la fecha límite", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros y prestamos
    await subscription.connect(addr1).setLenderParams(0, 1000, 3600);
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);

    // addr2 paga correctamente 1000 wei antes de nextDueDate
    await expect(
      subscription.connect(addr2).paySubscription(0, { value: 1000 })
    ).to.changeEtherBalance(addr1, 1000); // El propietario del token recibe 1000

    const [borrower, nextDueDate] = await subscription.getActiveSubscription(0);
    expect(borrower).to.equal(addr2.address);

    // nextDueDate debería haberse incrementado en 3600 segundos
    // No podemos predecir exactamente su valor, pero sí comparar que sea mayor
    // que el valor original
    // (Podrías hacer un test más fino con manipulación de tiempos en Hardhat)
    expect(nextDueDate).to.be.gt((await ethers.provider.getBlock("latest")).timestamp);
  });

  it("Debe revertir si el pago es realizado por alguien que no es el 'borrower'", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros y prestamos a addr2
    await subscription.connect(addr1).setLenderParams(0, 1000, 3600);
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);

    // addr1 intentando pagar (cuando el borrower es addr2)
    await expect(
      subscription.connect(addr1).paySubscription(0, { value: 1000 })
    ).to.be.revertedWith("Not the borrower");
  });

  it("Debe revertir si el valor enviado no coincide con la cantidad requerida", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros y prestamos
    await subscription.connect(addr1).setLenderParams(0, 1000, 3600);
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);

    // addr2 paga menos de lo requerido
    await expect(
      subscription.connect(addr2).paySubscription(0, { value: 500 })
    ).to.be.revertedWith("Incorrect payment amount");
  });

  it("Debe revertir si se intenta pagar después de la fecha límite (pago tarde)", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros y prestamos
    await subscription.connect(addr1).setLenderParams(0, 1000, 1); // 1 segundo de intervalo para prueba
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);

    // Esperamos más de 1 segundo para simular que expira el plazo
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Intentamos pagar cuando el nextDueDate ya pasó
    await expect(
      subscription.connect(addr2).paySubscription(0, { value: 1000 })
    ).to.be.revertedWith("Payment is late");
  });

  it("Debe permitir revocar la suscripción cuando está vencida", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros y prestamos a addr2
    await subscription.connect(addr1).setLenderParams(0, 1000, 1); // 1 segundo
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);

    // Esperamos a que venza
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Revocamos
    await subscription.connect(addr1).revokeSubscription(0);

    // Debe estar vacío el registro de la suscripción
    const [borrower, nextDueDate] = await subscription.getActiveSubscription(0);
    expect(borrower).to.equal(ethers.constants.AddressZero);
    expect(nextDueDate).to.equal(0);
  });

  it("Debe revertir si se intenta revocar una suscripción que aún está activa", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros y prestamos
    await subscription.connect(addr1).setLenderParams(0, 1000, 3600);
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);

    // Intentamos revocar inmediatamente sin esperar a que venza
    await expect(
      subscription.connect(addr1).revokeSubscription(0)
    ).to.be.revertedWith("Subscription still active");
  });

  it("Debe revertir la transferencia del token si la suscripción está activa", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros y prestamos
    await subscription.connect(addr1).setLenderParams(0, 1000, 3600);
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);

    // Intentamos transferir el token cuando la suscripción aún está activa
    await expect(
      subscription.connect(addr1)["safeTransferFrom(address,address,uint256)"](
        addr1.address,
        addr2.address,
        0
      )
    ).to.be.revertedWith("Subscription active: cannot transfer");
  });

  it("Debe permitir la transferencia del token si la suscripción no está activa", async function () {
    // Mint
    await subscription.connect(owner).safeMint(addr1.address, "uri-prueba");
    // Configuramos parámetros y prestamos con un intervalo muy corto
    await subscription.connect(addr1).setLenderParams(0, 1000, 1);
    await subscription.connect(addr1).lendToBorrower(0, addr2.address);

    // Esperamos a que venza (para que no esté activa)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Revocamos la suscripción
    await subscription.connect(addr1).revokeSubscription(0);

    // Ahora sí se puede transferir
    await subscription.connect(addr1)["safeTransferFrom(address,address,uint256)"](
      addr1.address,
      owner.address,
      0
    );

    expect(await subscription.ownerOf(0)).to.equal(owner.address);
  });

  it("Debe permitir pausar y despausar el contrato solo al 'owner'", async function () {
    // Pausar
    await subscription.connect(owner).pause();
    await expect(subscription.connect(owner).pause()).to.be.reverted; // Si ya está en pausa, no falla en sí, pero depende de tu lógica
    // Intentar mintear cuando está en pausa puede ser bloqueado por `_pause()`
    await expect(
      subscription.connect(owner).safeMint(owner.address, "uri-test")
    ).to.be.revertedWith("Pausable: paused");

    // Despausar
    await subscription.connect(owner).unpause();
    await subscription.connect(owner).safeMint(owner.address, "uri-test");
    expect(await subscription.ownerOf(1)).to.equal(owner.address);

    // addr1 intentando pausar (no es owner)
    await expect(subscription.connect(addr1).pause()).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
});
