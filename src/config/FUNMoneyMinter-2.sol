// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FUNMoneyMinter
 * @notice Core mint contract for FUN Ecosystem.
 * @dev This contract does NOT calculate Light Score on-chain.
 *      Backend validation is the source of truth for:
 *      - PPLP = Proof of Pure Love Protocol
 *      - Light Score evaluation
 *      - final mint amount per validated action
 *
 * Immutable economic rule enforced here:
 * - 99% of every mint goes directly to the user
 * - 1% of every mint goes to the platform treasury
 */

interface IERC20Mintable {
    function mint(address to, uint256 amount) external;
}

contract FUNMoneyMinter {
    error NotOwner();
    error NotAuthorizedMinter();
    error ZeroAddress();
    error InvalidBps();
    error AlreadyProcessed();
    error InvalidAmount();
    error InvalidClaimableAmount();

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event MinterSet(address indexed account, bool allowed);
    event PlatformTreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event TokenUpdated(address indexed previousToken, address indexed newToken);
    event ActionMinted(
        bytes32 indexed actionId,
        address indexed user,
        uint256 totalMint,
        uint256 userMint,
        uint256 platformMint,
        bytes32 validationDigest
    );
    event ActionMintedLocked(
        bytes32 indexed actionId,
        address indexed user,
        uint256 totalMint,
        uint256 userClaimable,
        uint256 userLocked,
        uint256 platformMint,
        uint64 releaseAt,
        bytes32 validationDigest
    );
    event LockedBalanceReleased(address indexed user, uint256 amount);

    struct LockedGrant {
        uint256 amount;
        uint64 releaseAt;
        bool claimed;
    }

    uint16 public constant USER_BPS = 9900;      // 99.00%
    uint16 public constant PLATFORM_BPS = 100;   // 1.00%
    uint16 public constant BPS_DENOMINATOR = 10000;

    address public owner;
    IERC20Mintable public funToken;
    address public platformTreasury;

    mapping(address => bool) public authorizedMinters;
    mapping(bytes32 => bool) public processedActionIds;
    mapping(address => LockedGrant[]) public lockedGrants;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuthorizedMinter() {
        if (!authorizedMinters[msg.sender]) revert NotAuthorizedMinter();
        _;
    }

    constructor(address token_, address platformTreasury_) {
        if (token_ == address(0) || platformTreasury_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        funToken = IERC20Mintable(token_);
        platformTreasury = platformTreasury_;
        authorizedMinters[msg.sender] = true;

        emit OwnerTransferred(address(0), msg.sender);
        emit MinterSet(msg.sender, true);
        emit TokenUpdated(address(0), token_);
        emit PlatformTreasuryUpdated(address(0), platformTreasury_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setAuthorizedMinter(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        authorizedMinters[account] = allowed;
        emit MinterSet(account, allowed);
    }

    function setPlatformTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit PlatformTreasuryUpdated(platformTreasury, newTreasury);
        platformTreasury = newTreasury;
    }

    function setToken(address newToken) external onlyOwner {
        if (newToken == address(0)) revert ZeroAddress();
        emit TokenUpdated(address(funToken), newToken);
        funToken = IERC20Mintable(newToken);
    }

    /**
     * @notice Mint FUN for a validated action.
     * @param actionId Unique backend action identifier hashed to bytes32.
     * @param user Recipient user wallet.
     * @param totalMint Total FUN to mint for this action.
     * @param validationDigest Hash of backend validation payload for auditability.
     */
    function mintValidatedAction(
        bytes32 actionId,
        address user,
        uint256 totalMint,
        bytes32 validationDigest
    ) external onlyAuthorizedMinter {
        if (user == address(0)) revert ZeroAddress();
        if (processedActionIds[actionId]) revert AlreadyProcessed();
        if (totalMint == 0) revert InvalidAmount();

        processedActionIds[actionId] = true;

        (uint256 userMint, uint256 platformMint) = _splitMint(totalMint);

        funToken.mint(user, userMint);
        funToken.mint(platformTreasury, platformMint);

        emit ActionMinted(actionId, user, totalMint, userMint, platformMint, validationDigest);
    }

    /**
     * @notice Mint FUN with optional time-locked portion for the user.
     * @dev Platform share is minted immediately.
     */
    function mintValidatedActionLocked(
        bytes32 actionId,
        address user,
        uint256 totalMint,
        uint256 userClaimableNow,
        uint64 releaseAt,
        bytes32 validationDigest
    ) external onlyAuthorizedMinter {
        if (user == address(0)) revert ZeroAddress();
        if (processedActionIds[actionId]) revert AlreadyProcessed();
        if (totalMint == 0) revert InvalidAmount();

        processedActionIds[actionId] = true;

        (uint256 userMint, uint256 platformMint) = _splitMint(totalMint);
        if (userClaimableNow > userMint) revert InvalidClaimableAmount();

        uint256 userLocked = userMint - userClaimableNow;

        if (userClaimableNow > 0) {
            funToken.mint(user, userClaimableNow);
        }
        if (platformMint > 0) {
            funToken.mint(platformTreasury, platformMint);
        }
        if (userLocked > 0) {
            lockedGrants[user].push(LockedGrant({
                amount: userLocked,
                releaseAt: releaseAt,
                claimed: false
            }));
        }

        emit ActionMintedLocked(
            actionId,
            user,
            totalMint,
            userClaimableNow,
            userLocked,
            platformMint,
            releaseAt,
            validationDigest
        );
    }

    function releaseLockedGrant(uint256 index) external {
        LockedGrant storage grant = lockedGrants[msg.sender][index];
        require(!grant.claimed, "already claimed");
        require(block.timestamp >= grant.releaseAt, "not released");

        grant.claimed = true;
        funToken.mint(msg.sender, grant.amount);

        emit LockedBalanceReleased(msg.sender, grant.amount);
    }

    function getLockedGrants(address user) external view returns (LockedGrant[] memory) {
        return lockedGrants[user];
    }

    function previewSplit(uint256 totalMint) external pure returns (uint256 userMint, uint256 platformMint) {
        return _splitMint(totalMint);
    }

    function _splitMint(uint256 totalMint) internal pure returns (uint256 userMint, uint256 platformMint) {
        userMint = (totalMint * USER_BPS) / BPS_DENOMINATOR;
        platformMint = totalMint - userMint;
    }
}
