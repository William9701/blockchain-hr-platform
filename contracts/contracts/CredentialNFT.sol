// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CredentialNFT
 * @dev NFT-based skill credentials issued by companies to talents
 *
 * KEY WEB3 CONCEPT:
 * - Credentials are immutable and verifiable on-chain
 * - Anyone can verify a talent's skills without trusting a central database
 * - Talent builds a portable, decentralized portfolio
 * - NFT metadata stored on IPFS for permanence
 *
 * NOTE: OpenZeppelin v5.0 removed Counters utility
 * We now use a simple uint256 counter instead
 */
contract CredentialNFT is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    // Credential metadata
    struct Credential {
        uint256 tokenId;
        address issuer;        // Company that issued
        address recipient;     // Talent who received
        string skillName;      // e.g., "Smart Contract Development"
        string credentialType; // e.g., "Completion", "Excellence", "Expert"
        uint256 issuedDate;
        string ipfsMetadata;   // Full credential details on IPFS
        bool revoked;          // Company can revoke if fraudulent
    }

    // Storage
    mapping(uint256 => Credential) public credentials;
    mapping(address => uint256[]) public talentCredentials;  // Talent's credential IDs
    mapping(address => uint256[]) public companyIssuedCredentials; // Company's issued IDs

    // Authorized issuers (verified companies)
    mapping(address => bool) public authorizedIssuers;

    // Events
    event CredentialIssued(
        uint256 indexed tokenId,
        address indexed issuer,
        address indexed recipient,
        string skillName
    );

    event CredentialRevoked(uint256 indexed tokenId, address indexed issuer);
    event IssuerAuthorized(address indexed issuer);
    event IssuerRevoked(address indexed issuer);

    constructor() ERC721("TalentCredential", "TCRED") Ownable(msg.sender) {}

    // ===== ISSUER MANAGEMENT =====

    /**
     * @dev Authorize a company to issue credentials
     */
    function authorizeIssuer(address _issuer) external onlyOwner {
        require(_issuer != address(0), "Invalid address");
        authorizedIssuers[_issuer] = true;
        emit IssuerAuthorized(_issuer);
    }

    /**
     * @dev Revoke issuer authorization
     */
    function revokeIssuer(address _issuer) external onlyOwner {
        authorizedIssuers[_issuer] = false;
        emit IssuerRevoked(_issuer);
    }

    // ===== CREDENTIAL ISSUANCE =====

    /**
     * @dev Issue a credential NFT to a talent
     * @notice Only authorized companies can issue credentials
     */
    function issueCredential(
        address _recipient,
        string memory _skillName,
        string memory _credentialType,
        string memory _tokenURI
    ) external returns (uint256) {
        require(authorizedIssuers[msg.sender], "Not authorized to issue credentials");
        require(_recipient != address(0), "Invalid recipient");

        uint256 newTokenId = _nextTokenId++;
        // Token IDs now start from 0 instead of 1 (modern approach)

        // Mint NFT to recipient
        _safeMint(_recipient, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);

        // Store credential data
        credentials[newTokenId] = Credential({
            tokenId: newTokenId,
            issuer: msg.sender,
            recipient: _recipient,
            skillName: _skillName,
            credentialType: _credentialType,
            issuedDate: block.timestamp,
            ipfsMetadata: _tokenURI,
            revoked: false
        });

        talentCredentials[_recipient].push(newTokenId);
        companyIssuedCredentials[msg.sender].push(newTokenId);

        emit CredentialIssued(newTokenId, msg.sender, _recipient, _skillName);

        return newTokenId;
    }

    /**
     * @dev Revoke a credential (in case of fraud)
     */
    function revokeCredential(uint256 _tokenId) external {
        Credential storage cred = credentials[_tokenId];
        require(cred.issuer == msg.sender, "Only issuer can revoke");
        require(!cred.revoked, "Already revoked");

        cred.revoked = true;

        emit CredentialRevoked(_tokenId, msg.sender);
    }

    // ===== VIEW FUNCTIONS =====

    /**
     * @dev Get talent's all credentials
     */
    function getTalentCredentials(address _talent) external view returns (uint256[] memory) {
        return talentCredentials[_talent];
    }

    /**
     * @dev Get company's issued credentials
     */
    function getCompanyCredentials(address _company) external view returns (uint256[] memory) {
        return companyIssuedCredentials[_company];
    }

    /**
     * @dev Get credential details
     */
    function getCredential(uint256 _tokenId) external view returns (
        address issuer,
        address recipient,
        string memory skillName,
        string memory credentialType,
        uint256 issuedDate,
        bool revoked
    ) {
        Credential storage cred = credentials[_tokenId];
        return (
            cred.issuer,
            cred.recipient,
            cred.skillName,
            cred.credentialType,
            cred.issuedDate,
            cred.revoked
        );
    }

    /**
     * @dev Verify if a credential is valid
     */
    function verifyCredential(uint256 _tokenId) external view returns (bool) {
        Credential storage cred = credentials[_tokenId];
        return !cred.revoked && ownerOf(_tokenId) == cred.recipient;
    }

    // ===== OVERRIDES =====

    /**
     * @dev Soulbound: Credentials are non-transferable
     * @notice This makes credentials permanently tied to the talent
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0)) but prevent transfers
        if (from != address(0)) {
            revert("Credentials are soulbound and cannot be transferred");
        }

        return super._update(to, tokenId, auth);
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
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
