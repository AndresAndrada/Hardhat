// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract ProjectNFT is
    ERC721,
    ERC721Enumerable,
    ERC721Pausable,
    ERC721Burnable,
    ERC721URIStorage,
    Ownable
{
    using ECDSA for bytes32;

    uint256 private _tokenIdCounter;

    enum Phase {
        InitiationAndPlanning,
        Modeling,
        Construction,
        Deployment
    }

    struct Project {
        uint256 projectId;
        address client;
        address company;
        Phase currentPhase;
        mapping(Phase => bool) phaseCompleted;
        mapping(Phase => string) phaseMetadataURI;
    }

    mapping(uint256 => Project) public projects;

    event PhaseAdvanced(
        uint256 indexed projectId,
        Phase newPhase,
        uint256 tokenId
    );
    event ProjectRegistered(
        uint256 indexed projectId,
        address client,
        address company
    );

    constructor(
        address initialOwner
    ) ERC721("ProjectNFT", "PNFT") Ownable(initialOwner) {
        _tokenIdCounter = 0;
    }

    function registerProject(
        address client,
        address company,
        string memory initialMetadataURI
    ) external onlyOwner whenNotPaused {
        uint256 projectId = _tokenIdCounter;
        _tokenIdCounter = _tokenIdCounter + 1;

        Project storage newProject = projects[projectId];
        newProject.projectId = projectId;
        newProject.client = client;
        newProject.company = company;
        newProject.currentPhase = Phase.InitiationAndPlanning;
        newProject.phaseMetadataURI[
            Phase.InitiationAndPlanning
        ] = initialMetadataURI;
        newProject.phaseCompleted[Phase.InitiationAndPlanning] = false;

        emit ProjectRegistered(projectId, client, company);
    }

    function advancePhase(
        uint256 projectId,
        string memory metadataURI,
        bytes memory clientSignature,
        bytes memory companySignature
    ) external whenNotPaused {
        Project storage project = projects[projectId];
        require(project.client != address(0), "Project does not exist");
        require(
            msg.sender == project.client || msg.sender == project.company,
            "Unauthorized"
        );
        require(
            !project.phaseCompleted[project.currentPhase],
            "Current phase already completed"
        );

        // Crear el mensaje y aplicar el prefijo Ethereum Signed Message manualmente
        bytes32 messageHash = keccak256(
            abi.encodePacked(projectId, uint256(project.currentPhase))
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // Validar firmas digitales usando ECDSA.recover
        address clientSigner = ECDSA.recover(
            ethSignedMessageHash,
            clientSignature
        );
        address companySigner = ECDSA.recover(
            ethSignedMessageHash,
            companySignature
        );
        require(clientSigner == project.client, "Invalid client signature");
        require(companySigner == project.company, "Invalid company signature");

        // Marcar la fase actual como completada
        project.phaseCompleted[project.currentPhase] = true;

        // Mintear el NFT para la fase actual
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter = _tokenIdCounter + 1;
        _safeMint(project.client, tokenId);
        _setTokenURI(tokenId, metadataURI);

        // Avanzar a la siguiente fase
        if (project.currentPhase != Phase.Deployment) {
            project.currentPhase = Phase(uint256(project.currentPhase) + 1);
            project.phaseMetadataURI[project.currentPhase] = "";
        }

        emit PhaseAdvanced(projectId, project.currentPhase, tokenId);
    }

    function safeMint(
        address to,
        string memory uri
    ) public onlyOwner whenNotPaused returns (uint256) {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter = _tokenIdCounter + 1;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }

    function getProjectPhase(
        uint256 projectId
    ) external view returns (Phase, bool, string memory) {
        Project storage project = projects[projectId];
        return (
            project.currentPhase,
            project.phaseCompleted[project.currentPhase],
            project.phaseMetadataURI[project.currentPhase]
        );
    }

    function updatePhaseMetadata(
        uint256 projectId,
        Phase phase,
        string memory newMetadataURI
    ) external onlyOwner {
        Project storage project = projects[projectId];
        require(project.client != address(0), "Project does not exist");
        project.phaseMetadataURI[phase] = newMetadataURI;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // Overrides requeridos por Solidity
    function _update(
        address to,
        uint256 tokenId,
        address auth
    )
        internal
        override(ERC721, ERC721Enumerable, ERC721Pausable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
