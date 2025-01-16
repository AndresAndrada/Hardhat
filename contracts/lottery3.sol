// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.19;

// import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";  // Import ERC721 standard for NFT token functionality.
// import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";  // Import ERC721Enumerable for token enumeration.
// import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";  // Import ERC721URIStorage for token URI management.
// import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";  // Import AccessControl for role-based permissions.
// import {VRFV2PlusWrapperConsumerBase} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFV2PlusWrapperConsumerBase.sol";  // Import Chainlink VRF for random number generation.
// import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";  // Import client library for Chainlink VRF.
// import "@openzeppelin/contracts/security/ReentrancyGuard.sol";  // Import ReentrancyGuard to prevent reentrancy attacks.

// contract Lottery is ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl, VRFV2PlusWrapperConsumerBase, ReentrancyGuard {
    
//     // Maximum tickets a player can purchase
//     uint256 public constant MAX_TICKETS_PER_PLAYER = 3;

//     // Enum representing the possible states of the lottery
//     enum LOTTERY_STATE { OPEN, CALCULATING_WINNER, CLOSED }
//     LOTTERY_STATE public lotteryState;

//     // The base URI for the metadata of the tokens
//     string public baseURI;

//     // The ID of the next token to be minted
//     uint256 public nextTokenId;

//     // Mapping to track how many tickets each player has purchased
//     mapping(address => uint256) public playerTickets;

//     // Mapping from ticket ID to the player who owns the ticket
//     mapping(uint256 => address) public ticketOwners;

//     // Mapping to track pending withdrawals for each address
//     mapping(address => uint256) public pendingWithdrawals;

//     // The price of a single ticket in wei
//     uint256 public ticketPrice;

//     // Maximum number of tickets available for sale
//     uint256 public maxTickets;

//     // Chainlink VRF settings
//     uint32 public callbackGasLimit = 100000;  // Gas limit for the callback
//     uint16 public requestConfirmations = 3;  // Number of confirmations required for Chainlink VRF
//     uint32 public numWords = 1;  // Number of random words to request from VRF

//     // Address that will receive the fee
//     address public feeRecipient;

//     // Track the last random request ID
//     uint256 public lastRequestId;

//     // Address of the lottery winner
//     address public winnerAddress;

//     // The ID of the winning ticket
//     uint256 public winningTicketId;

//     // Event emitted when the lottery is started
//     event LotteryStarted(address indexed starter);

//     // Event emitted when a ticket is purchased
//     event TicketPurchased(address indexed buyer, uint256 indexed ticketId);

//     // Event emitted when the lottery ends and a winner is selected
//     event LotteryEnded(address indexed winner, uint256 winningTicketId);

//     // Event emitted when a randomness request is made
//     event RandomnessRequested(uint256 requestId);

//     // Event emitted when the randomness is fulfilled
//     event RandomnessFulfilled(uint256 requestId, uint256 randomWord);

//     // Event emitted when a withdrawal is made
//     event Withdrawal(address indexed recipient, uint256 amount);

//     // Event emitted when the base URI is updated
//     event BaseURIUpdated(string newBaseURI);

//     // Constructor to initialize the contract with the provided parameters
//     constructor(
//         string memory initialBaseURI,  // Initial base URI for the token metadata
//         address vrfWrapperAddress,  // The address of the Chainlink VRF wrapper
//         uint256 _ticketPrice,  // The price of a ticket in wei
//         uint256 _maxTickets  // Maximum number of tickets that can be sold
//     ) ERC721("LotteryNFT", "LTNFT") VRFV2PlusWrapperConsumerBase(vrfWrapperAddress) {
//         require(_maxTickets > 0, "Maximum tickets must be greater than zero");

//         baseURI = initialBaseURI;
//         ticketPrice = _ticketPrice;
//         maxTickets = _maxTickets;
//         lotteryState = LOTTERY_STATE.OPEN;
//         nextTokenId = 0;
//         winnerAddress = address(0);
//         winningTicketId = 0;

//         feeRecipient = msg.sender;  // The deployer of the contract will initially be the fee recipient

//         _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);  // Grant the admin role to the deployer
//         emit LotteryStarted(msg.sender);  // Emit an event that the lottery has started
//     }

//     // Allows the admin to change the base URI for the token metadata
//     function setBaseURI(string memory newBaseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
//         require(bytes(newBaseURI).length > 0, "Base URI cannot be empty");
//         baseURI = newBaseURI;
//         emit BaseURIUpdated(newBaseURI);
//     }

//     // Allows the admin to set the fee recipient
//     function setFeeRecipient(address _feeRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
//         require(_feeRecipient != address(0), "Fee recipient cannot be zero address");
//         feeRecipient = _feeRecipient;
//     }

//     // Allows a player to purchase a lottery ticket
//     function buyTicket() external payable nonReentrant {
//         // Ensure the lottery is open
//         require(lotteryState == LOTTERY_STATE.OPEN, "Lottery is not open");

//         // Ensure there are still tickets available
//         require(nextTokenId < maxTickets, "Maximum ticket limit reached");

//         // Ensure the player has not exceeded the maximum ticket limit
//         require(playerTickets[msg.sender] < MAX_TICKETS_PER_PLAYER, "Player reached maximum ticket limit");

//         // Ensure the player sends the correct amount of ETH
//         require(msg.value == ticketPrice, "Incorrect ETH value sent");

//         // Mint a new ticket (ERC721 token)
//         uint256 tokenId = nextTokenId++;
//         _safeMint(msg.sender, tokenId);

//         // Assign a unique URI to the token
//         string memory tokenSpecificURI = string(abi.encodePacked(baseURI, "/", uint256ToString(tokenId)));
//         _setTokenURI(tokenId, tokenSpecificURI);

//         // Record the ticket ownership
//         ticketOwners[tokenId] = msg.sender;
//         playerTickets[msg.sender]++;

//         emit TicketPurchased(msg.sender, tokenId);  // Emit an event when a ticket is purchased

//         // If all tickets have been sold, trigger the winner selection process
//         if (nextTokenId == maxTickets) {
//             lotteryState = LOTTERY_STATE.CALCULATING_WINNER;
//             requestRandomWords();  // Request randomness from Chainlink VRF
//         }
//     }

//     // Requests random words from Chainlink VRF to determine the winner
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

//         lastRequestId = requestId;  // Store the request ID for later reference
//         emit RandomnessRequested(requestId);  // Emit an event that randomness has been requested
//     }

//     // Callback function invoked when Chainlink VRF returns random numbers
//     function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal override nonReentrant {
//         // Ensure the lottery is in the winner selection phase
//         require(lotteryState == LOTTERY_STATE.CALCULATING_WINNER, "Not ready for winner selection");

//         // Ensure at least one random word is provided
//         require(_randomWords.length > 0, "No random words provided");

//         // Use the random word to select the winner
//         uint256 winnerIndex = _randomWords[0] % nextTokenId;  // Select a winner based on the random number
//         address winner = ticketOwners[winnerIndex];

//         // Calculate the reward amount (prize pool) and fee
//         uint256 rewardAmount = address(this).balance;
//         uint256 feeAmount = (rewardAmount * 2) / 100;  // 2% fee
//         uint256 netReward = rewardAmount - feeAmount;

//         // Record pending withdrawals for the fee recipient and winner
//         pendingWithdrawals[feeRecipient] += feeAmount;
//         pendingWithdrawals[winner] += netReward;

//         // Update the winner and lottery state
//         winnerAddress = winner;
//         winningTicketId = winnerIndex;

//         lotteryState = LOTTERY_STATE.CLOSED;  // Mark the lottery as closed

//         emit RandomnessFulfilled(_requestId, _randomWords[0]);  // Emit an event when randomness is fulfilled
//         emit LotteryEnded(winner, winnerIndex);  // Emit an event when the lottery ends
//     }

//     // Allows players or the fee recipient to withdraw their pending funds
//     function withdraw() external nonReentrant {
//         uint256 amount = pendingWithdrawals[msg.sender];
//         require(amount > 0, "No funds to withdraw");

//         pendingWithdrawals[msg.sender] = 0;  // Reset the pending withdrawal amount

//         // Transfer the funds to the recipient
//         (bool success, ) = payable(msg.sender).call{value: amount, gas: 10000}("");  // Set a gas limit to avoid DoS attacks
//         require(success, "Transfer failed");

//         emit Withdrawal(msg.sender, amount);  // Emit an event when a withdrawal is made
//     }

//     // Utility function to convert uint256 to string (used for generating token URIs)
//     function uint256ToString(uint256 value) internal pure returns (string memory) {
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

//     // Overridden function to check if a contract supports a specific interface
//     function supportsInterface(bytes4 interfaceId)
//         public
//         view
//         virtual
//         override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl)
//         returns (bool)
//     {
//         return super.supportsInterface(interfaceId);
//     }

//     // Overridden function to return the token URI for a specific token ID
//     function tokenURI(uint256 tokenId)
//         public
//         view
//         virtual
//         override(ERC721, ERC721URIStorage)
//         returns (string memory)
//     {
//         return super.tokenURI(tokenId);
//     }

//     // Overridden function to increase the balance of an address (from ERC721 and ERC721Enumerable)
//     function _increaseBalance(address account, uint128 value)
//         internal
//         virtual
//         override(ERC721, ERC721Enumerable)
//     {
//         super._increaseBalance(account, value);
//     }

//     // Overridden function to update token ownership information
//     function _update(address to, uint256 tokenId, address auth)
//         internal
//         virtual
//         override(ERC721, ERC721Enumerable)
//         returns (address)
//     {
//         return super._update(to, tokenId, auth);
//     }
// }
