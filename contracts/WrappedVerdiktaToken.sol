// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title ICrossDomainMessenger
 * @notice Minimal interface to check xDomainMessageSender.
 */
interface ICrossDomainMessenger {
    function xDomainMessageSender() external view returns (address);
}

/**
 * @title IStandardBridge
 * @notice Interface for the Base Standard Bridge.
 */
interface IStandardBridge {
    function withdraw(
        address _l2Token,
        uint256 _amount,
        uint32 _minGasLimit,
        bytes calldata _extraData
    ) external payable;
}

/**
 * @title IOptimismMintableERC20
 * @notice Interface for Optimism Mintable ERC20 tokens.
 */
interface IOptimismMintableERC20 {
    function remoteToken() external view returns (address);
    function bridge() external returns (address);
    function mint(address _to, uint256 _amount) external;
    function burn(address _from, uint256 _amount) external;
}

/**
 * @title ILegacyMintableERC20
 * @notice Legacy interface for Mintable ERC20 tokens.
 */
interface ILegacyMintableERC20 {
    function l1Token() external view returns (address);
    function mint(address _to, uint256 _amount) external;
    function burn(address _from, uint256 _amount) external;
}

/**
 * @title WrappedVerdiktaToken
 * @notice Wrapped version of VerdiktaToken for Base Sepolia, compatible with Base Standard Bridge.
 * Implements IOptimismMintableERC20 and ILegacyMintableERC20.
 */
contract WrappedVerdiktaToken is ERC20Permit, Ownable, ERC165, IOptimismMintableERC20, ILegacyMintableERC20 {
    address public immutable l1_Token;
    address public immutable l1Bridge;
    address public immutable l2Bridge;

    // Base’s L2CrossDomainMessenger address.
    address public constant L2_CROSS_DOMAIN_MESSENGER =
        0x4200000000000000000000000000000000000007;

    // Base Sepolia L2 Standard Bridge address.
    address public constant L2_STANDARD_BRIDGE =
        0x4200000000000000000000000000000000000010;

    /**
     * @dev Modifier to restrict access to the L2 bridge.
     * Allows either a direct call from the L2 Standard Bridge or from the messenger.
     */
    modifier onlyBridge() {
        require(
            msg.sender == L2_STANDARD_BRIDGE || msg.sender == L2_CROSS_DOMAIN_MESSENGER,
            "Caller is not L2StandardBridge or messenger"
        );
        _;
    }

    /**
     * @notice Constructor for WrappedVerdiktaToken.
     * @param _l1Token Address of the VerdiktaToken on Sepolia.
     * @param _l1Bridge Address of the L1 Standard Bridge.
     * @param _l2Bridge Address of the L2 Standard Bridge (must equal L2_STANDARD_BRIDGE).
     */
    constructor(
        address _l1Token,
        address _l1Bridge,
        address _l2Bridge
    )
        ERC20("Wrapped Verdikta", "wVDKA")
        ERC20Permit("Wrapped Verdikta")
        Ownable(msg.sender)
    {
        require(_l1Token != address(0), "Invalid L1 token address");
        require(_l1Bridge != address(0), "Invalid L1 bridge address");
        require(_l2Bridge == L2_STANDARD_BRIDGE, "Invalid L2 bridge address");

        l1_Token = _l1Token;
        l1Bridge = _l1Bridge;
        l2Bridge = _l2Bridge;
    }

    /**
     * @notice Returns the L1 token address.
     * Required for compatibility with ILegacyMintableERC20.
     */
    function l1Token() external view override returns (address) {
        return l1_Token;
    }

    /**
     * @notice Implements IOptimismMintableERC20.
     * @return The remote token address (L1 token address).
     */
    function remoteToken() external view override returns (address) {
        return l1_Token;
    }

    /**
     * @notice Implements IOptimismMintableERC20.
     * @return The bridge address (L2 Standard Bridge).
     */
    function bridge() external pure override returns (address) {
        return L2_STANDARD_BRIDGE;
    }

    /**
     * @notice ERC165 support.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
        return
            interfaceId == type(IOptimismMintableERC20).interfaceId ||
            interfaceId == type(ILegacyMintableERC20).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @notice Mint tokens when bridged from L1.
     * Can be called by L2StandardBridge or via the messenger.
     * @param to Address to mint tokens to.
     * @param amount Amount of tokens to mint.
     */
    function mint(address to, uint256 amount)
        external
        override(ILegacyMintableERC20, IOptimismMintableERC20)
        onlyBridge
    {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens to withdraw them back to L1.
     * @param amount Amount of tokens to withdraw.
     * @param minGasLimit Minimum gas limit for the L1 execution.
     * @param extraData Additional data for the withdrawal.
     */
    function withdraw(
        uint256 amount,
        uint32 minGasLimit,
        bytes calldata extraData
    ) external payable {
        _burn(msg.sender, amount);
        IStandardBridge(l2Bridge).withdraw{value: msg.value}(
            address(this),
            amount,
            minGasLimit,
            extraData
        );
    }

    /**
     * @notice Burn tokens from a specific address (used by the bridge).
     * Can be called either directly by L2StandardBridge or via the messenger.
     * @param from Address to burn tokens from.
     * @param amount Amount of tokens to burn.
     */
    function burn(address from, uint256 amount)
        external
        override(ILegacyMintableERC20, IOptimismMintableERC20)
        onlyBridge
    {
        _burn(from, amount);
    }

    /**
     * @notice Finalizes a deposit from L1 to L2.
     * Called by the L2 Standard Bridge to finalize an ERC20 deposit.
     * @param _l1Token Address of the L1 token.
     * @param _l2Token Address of the L2 token (should equal this contract's address).
     * @param _to Address to receive the minted tokens.
     * @param _amount Amount of tokens deposited.
     */
    function finalizeDepositERC20(
        address _l1Token,
        address _l2Token,
        address /* _from */,
        address _to,
        uint256 _amount,
        bytes calldata /* _extraData */
    ) external payable {
        require(msg.sender == L2_STANDARD_BRIDGE, "Caller is not the L2 Standard Bridge");
        require(_l2Token == address(this), "L2 token address mismatch");
        require(_l1Token == l1_Token, "L1 token address mismatch");
        _mint(_to, _amount);
    }
}

