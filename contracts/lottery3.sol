// // // SPDX-License-Identifier: MIT
// // pragma solidity ^0.8.19;

// import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
// import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
// import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
// import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
// import {VRFV2PlusWrapperConsumerBase} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFV2PlusWrapperConsumerBase.sol";
// import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
// import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// contract Lottery2 is
//     ERC721,
//     ERC721Enumerable,
//     ERC721URIStorage,
//     AccessControl,
//     VRFV2PlusWrapperConsumerBase,
//     ReentrancyGuard
// {
//     uint256 public constant MAX_TICKETS_PER_PLAYER = 3;

//     enum LOTTERY_STATE {
//         OPEN,
//         CALCULATING_WINNER,
//         CLOSED
//     }
//     LOTTERY_STATE public lotteryState;

//     string public baseURI;
//     uint256 public nextTokenId;

//     mapping(address => uint256) public playerTickets;
//     mapping(uint256 => address) public ticketOwners;
//     mapping(address => uint256) public pendingWithdrawals;

//     uint256 public ticketPrice;
//     uint256 public maxTickets;

//     uint32 public callbackGasLimit = 100000;
//     uint16 public requestConfirmations = 3;
//     uint32 public numWords = 1;

//     address public feeRecipient;
//     uint256 public lastRequestId;

//     address public winnerAddress;
//     uint256 public winningTicketId;

//     event LotteryStarted(address indexed starter);
//     event TicketPurchased(address indexed buyer, uint256 indexed ticketId);
//     event LotteryEnded(address indexed winner, uint256 winningTicketId);
//     event RandomnessRequested(uint256 requestId);
//     event RandomnessFulfilled(uint256 requestId, uint256 randomWord);
//     event Withdrawal(address indexed recipient, uint256 amount);
//     event BaseURIUpdated(string newBaseURI);

//     constructor(
//         string memory initialBaseURI,
//         address vrfWrapperAddress,
//         uint256 _ticketPrice,
//         uint256 _maxTickets
//     )
//         ERC721("LotteryNFT", "LTNFT")
//         VRFV2PlusWrapperConsumerBase(vrfWrapperAddress)
//     {
//         require(_maxTickets > 0, "Maximum tickets must be greater than zero");

//         //         baseURI = initialBaseURI;
//         //         ticketPrice = _ticketPrice;
//         //         maxTickets = _maxTickets;
//         //         lotteryState = LOTTERY_STATE.OPEN;
//         //         nextTokenId = 0;
//         //         winnerAddress = address(0);
//         //         winningTicketId = 0;

//         feeRecipient = msg.sender;
//         _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
//         emit LotteryStarted(msg.sender);
//     }

//     function setBaseURI(
//         string memory newBaseURI
//     ) external onlyRole(DEFAULT_ADMIN_ROLE) {
//         require(bytes(newBaseURI).length > 0, "Base URI cannot be empty");
//         baseURI = newBaseURI;
//         emit BaseURIUpdated(newBaseURI);
//     }

//     function setFeeRecipient(
//         address _feeRecipient
//     ) external onlyRole(DEFAULT_ADMIN_ROLE) {
//         require(
//             _feeRecipient != address(0),
//             "Fee recipient cannot be zero address"
//         );
//         require(
//             _feeRecipient != feeRecipient,
//             "Fee recipient is already set to this address"
//         );
//         feeRecipient = _feeRecipient;
//     }

//     function buyTicket(uint256 quantity) external payable nonReentrant {
//         require(lotteryState == LOTTERY_STATE.OPEN, "Lottery is not open");
//         require(quantity > 0, "Quantity must be greater than zero");
//         require(
//             nextTokenId + quantity <= maxTickets,
//             "Maximum ticket limit reached"
//         );
//         require(
//             playerTickets[msg.sender] + quantity <= MAX_TICKETS_PER_PLAYER,
//             "Player reached maximum ticket limit"
//         );
//         require(
//             msg.value >= quantity * ticketPrice,
//             "Incorrect ETH value sent"
//         );

//         uint256 excess = msg.value - quantity * ticketPrice;
//         if (excess > 0) {
//             payable(msg.sender).transfer(excess);
//         }

//         for (uint256 i = 0; i < quantity; i++) {
//             uint256 tokenId = nextTokenId++;
//             _safeMint(msg.sender, tokenId);

//             string memory tokenSpecificURI = string(
//                 abi.encodePacked(baseURI, "/", uint256ToString(tokenId))
//             );
//             _setTokenURI(tokenId, tokenSpecificURI);

//             ticketOwners[tokenId] = msg.sender;
//             playerTickets[msg.sender]++;

//             emit TicketPurchased(msg.sender, tokenId);
//         }

//         if (nextTokenId == maxTickets) {
//             lotteryState = LOTTERY_STATE.CALCULATING_WINNER;
//             requestRandomWords();
//         }
//     }

//     function requestRandomWords() internal {
//         bytes memory extraArgs = VRFV2PlusClient._argsToBytes(
//             VRFV2PlusClient.ExtraArgsV1({nativePayment: true})
//         );
//         (uint256 requestId, ) = requestRandomnessPayInNative(
//             callbackGasLimit,
//             requestConfirmations,
//             numWords,
//             extraArgs
//         );

//         lastRequestId = requestId;
//         emit RandomnessRequested(requestId);
//     }

//     function fulfillRandomWords(
//         uint256 _requestId,
//         uint256[] memory _randomWords
//     ) internal override nonReentrant {
//         require(_requestId == lastRequestId, "Invalid random request ID");
//         require(
//             lotteryState == LOTTERY_STATE.CALCULATING_WINNER,
//             "Not ready for winner selection"
//         );
//         require(_randomWords.length > 0, "No random words provided");

//         uint256 winnerIndex = _randomWords[0] % nextTokenId;
//         address winner = ticketOwners[winnerIndex];

//         uint256 rewardAmount = address(this).balance;
//         uint256 feeAmount = (rewardAmount * 2) / 100;
//         uint256 netReward = rewardAmount - feeAmount;

//         // Transferir automáticamente el premio al ganador
//         (bool successWinner, ) = payable(winner).call{value: netReward}("");
//         require(successWinner, "Transfer to winner failed");

//         // Transferir automáticamente la tarifa al feeRecipient
//         (bool successFee, ) = payable(feeRecipient).call{value: feeAmount}("");
//         require(successFee, "Transfer to fee recipient failed");

//         winnerAddress = winner;
//         winningTicketId = winnerIndex;

//         lotteryState = LOTTERY_STATE.CLOSED;

//         emit RandomnessFulfilled(_requestId, _randomWords[0]);
//         emit LotteryEnded(winner, winnerIndex);
//         resetLottery();
//     }

//     function uint256ToString(
//         uint256 value
//     ) internal pure returns (string memory) {
//         if (value == 0) return "0";
//         uint256 temp = value;
//         uint256 digits;
//         while (temp != 0) {
//             digits++;
//             temp /= 10;
//         }
//         bytes memory buffer = new bytes(digits);
//         while (value != 0) {
//             digits -= 1;
//             buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
//             value /= 10;
//         }
//         return string(buffer);
//     }

//     function supportsInterface(
//         bytes4 interfaceId
//     )
//         public
//         view
//         virtual
//         override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl)
//         returns (bool)
//     {
//         return super.supportsInterface(interfaceId);
//     }

//     function tokenURI(
//         uint256 tokenId
//     )
//         public
//         view
//         virtual
//         override(ERC721, ERC721URIStorage)
//         returns (string memory)
//     {
//         return super.tokenURI(tokenId);
//     }

//     function getTicketsSold() external view returns (uint256) {
//         return nextTokenId;
//     }

//     function _increaseBalance(
//         address account,
//         uint128 value
//     ) internal virtual override(ERC721, ERC721Enumerable) {
//         super._increaseBalance(account, value);
//     }

//     function _update(
//         address to,
//         uint256 tokenId,
//         address auth
//     ) internal virtual override(ERC721, ERC721Enumerable) returns (address) {
//         return super._update(to, tokenId, auth);
//     }

//     function resetLottery() private {
//         require(
//             lotteryState == LOTTERY_STATE.CLOSED,
//             "Lottery must be closed to reset"
//         );

//         // Eliminar todos los NFTs
//         for (uint256 i = 0; i < nextTokenId; i++) {
//             _burn(i);
//         }

//         // Reiniciar variables
//         nextTokenId = 0;
//         winnerAddress = address(0);
//         winningTicketId = 0;

//         // Limpiar los mapeos
//         for (uint256 i = 0; i < nextTokenId; i++) {
//             delete ticketOwners[i]; // Limpiar propietarios de tickets
//         }
//         lotteryState = LOTTERY_STATE.OPEN;
//     }
// }
