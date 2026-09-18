// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FunDisperse
 * @notice Disperse BNB / ERC20 tokens to many recipients in a single transaction.
 *         Built for F.U. Profile bulk-send (up to 999 wallets per session, batched ≤ 250/tx).
 *
 *         Security:
 *         - No owner / no upgrade / no ETH stored. Refunds dust BNB automatically.
 *         - Uses transferFrom (pull) for ERC20 so each user just approves once per token.
 *         - Each recipient gets a standard ERC20 Transfer event → BSCScan & wallets show
 *           normal incoming tx in their history.
 *
 *         Events:
 *         - BatchDispersed(sender, token, totalAmount, count, batchId) for indexers.
 *           token == address(0) means native BNB.
 */
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract FunDisperse {
    event BatchDispersed(
        address indexed sender,
        address indexed token,
        uint256 totalAmount,
        uint256 recipientCount,
        bytes32 batchId
    );

    error LengthMismatch();
    error EmptyList();
    error TooManyRecipients();
    error ZeroRecipient();
    error InsufficientValue();
    error TransferFailed();

    uint256 public constant MAX_RECIPIENTS_PER_TX = 250;

    /**
     * @dev Disperse native BNB. msg.value must equal sum(amounts). Any excess refunded.
     */
    function disperseEther(
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32 batchId
    ) external payable {
        uint256 len = recipients.length;
        if (len == 0) revert EmptyList();
        if (len > MAX_RECIPIENTS_PER_TX) revert TooManyRecipients();
        if (len != amounts.length) revert LengthMismatch();

        uint256 total;
        for (uint256 i = 0; i < len; ) {
            address to = recipients[i];
            uint256 amt = amounts[i];
            if (to == address(0)) revert ZeroRecipient();
            total += amt;
            (bool ok, ) = to.call{value: amt}("");
            if (!ok) revert TransferFailed();
            unchecked { ++i; }
        }

        if (msg.value < total) revert InsufficientValue();

        // Refund dust
        uint256 refund = msg.value - total;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }

        emit BatchDispersed(msg.sender, address(0), total, len, batchId);
    }

    /**
     * @dev Disperse an ERC20 token. Caller must `approve(this, total)` first
     *      (or once with type(uint256).max for unlimited future batches).
     */
    function disperseToken(
        IERC20 token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32 batchId
    ) external {
        uint256 len = recipients.length;
        if (len == 0) revert EmptyList();
        if (len > MAX_RECIPIENTS_PER_TX) revert TooManyRecipients();
        if (len != amounts.length) revert LengthMismatch();

        uint256 total;
        for (uint256 i = 0; i < len; ) {
            address to = recipients[i];
            uint256 amt = amounts[i];
            if (to == address(0)) revert ZeroRecipient();
            total += amt;
            bool ok = token.transferFrom(msg.sender, to, amt);
            if (!ok) revert TransferFailed();
            unchecked { ++i; }
        }

        emit BatchDispersed(msg.sender, address(token), total, len, batchId);
    }
}
