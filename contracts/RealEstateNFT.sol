// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract RealEstateNFT is ERC721, ERC721Enumerable, ERC721URIStorage, ERC721Pausable, AccessControl, ERC721Burnable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    uint256 private _nextTokenId;
    
    // Estructura para almacenar información de la propiedad
    struct PropertyDetails {
        string location;
        uint256 squareMeters;
        bool verified;
        address verifier;
        uint256 verificationDate;
    }
    
    // Mapeo de tokenId a detalles de propiedad
    mapping(uint256 => PropertyDetails) public propertyDetails;
    
    // Evento para registrar verificaciones de propiedades
    event PropertyVerified(uint256 indexed tokenId, address indexed verifier);

    constructor(address defaultAdmin, address pauser, address minter, address verifier)
        ERC721("RealEstateToken", "RET")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, pauser);
        _grantRole(MINTER_ROLE, minter);
        _grantRole(VERIFIER_ROLE, verifier);
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function mintProperty(
        address to, 
        string memory uri, 
        string memory location, 
        uint256 squareMeters
    )
        public
        onlyRole(MINTER_ROLE)
        returns (uint256)
    {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        
        // Almacenar detalles de la propiedad
        propertyDetails[tokenId] = PropertyDetails({
            location: location,
            squareMeters: squareMeters,
            verified: false,
            verifier: address(0),
            verificationDate: 0
        });
        
        return tokenId;
    }
    
    function verifyProperty(uint256 tokenId) 
        public 
        onlyRole(VERIFIER_ROLE) 
    {
        require(_exists(tokenId), "Property does not exist");
        require(!propertyDetails[tokenId].verified, "Property already verified");
        
        propertyDetails[tokenId].verified = true;
        propertyDetails[tokenId].verifier = msg.sender;
        propertyDetails[tokenId].verificationDate = block.timestamp;
        
        emit PropertyVerified(tokenId, msg.sender);
    }
    
    function isPropertyVerified(uint256 tokenId) public view returns (bool) {
        require(_exists(tokenId), "Property does not exist");
        return propertyDetails[tokenId].verified;
    }

    // The following functions are overrides required by Solidity.

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable, ERC721Pausable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}