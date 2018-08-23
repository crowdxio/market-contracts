pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/ReentrancyGuard.sol";
import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";

contract UniqxMarketBase is NoOwner, Pausable, ReentrancyGuard {

	using SafeMath for uint;

	address public MARKET_FEE_COLLECTOR;
	bool public ORDERS_ENABLED = true;
	uint public marketFeeNum = 1;
	uint public marketFeeDen = 100;

	enum OrderStatus {
		Unknown,
		Listed,			// token listed by owner or seller
		Reserved,		// not used in this contract
		Cancelled,		// order canceled by owner or seller (some restrictions are applied on auction orders)
		Sold,			// token sold, the item goes to the buyer or to the highest bidder on auction orders
		Unsold			// auction ended with zero bids, token goes back to owner
	}


	event LogOrdersEnabled();
	event LogOrdersDisabled();
	event LogTokenRegistered(address token);
	event LogTokenOrdersEnabled(address token);
	event LogTokenOrdersDisabled(address token);

	event LogTokenListedFixedPrice(
		address token,
		uint tokenId,
		address owner,
		address seller,
		uint buyPrice
	);

	event LogTokensListedFixedPrice(
		// lookup
		address token,
		uint[] tokenIds,

		// common
		address[] owners,
		address seller,
		uint[] buyPrices
	);

	event LogTokensListedAuction(
		// lookup
		address token,
		uint[] tokenIds,

		// common
		address[] owners,
		address seller,
		uint[] buyPrices,

		// auction
		uint[] startPrices,
		uint[] endTimes
	);

	event LogBidPlaced(address token, uint tokenId, address bidder, uint bid);
	event LogTokenSold(address token, uint tokenId, address buyer, uint price);
	event LogTokensCancelled(address token, uint[] tokenIds);
	event LogTokenUnsold(address token, uint tokenId);

	modifier whenOrdersEnabled() {
		require(ORDERS_ENABLED, "Orders must be enabled");
		_;
	}

	modifier whenOrdersDisabled() {
		require(!ORDERS_ENABLED, "Orders must be disabled");
		_;
	}

	function setMarketFee(uint _marketFeeNum, uint _marketFeeDen)
		onlyOwner
	public {

		marketFeeNum = _marketFeeNum;
		marketFeeDen = _marketFeeDen;
	}

	function setMarketFeeCollector(address _marketFeeCollector)
		onlyOwner
	public {

		MARKET_FEE_COLLECTOR = _marketFeeCollector;
	}

	function enableOrders()
		onlyOwner
		whenOrdersDisabled
	public {

		ORDERS_ENABLED = true;
		emit LogOrdersEnabled();
	}

	function disableOrders()
		onlyOwner
		whenOrdersEnabled
	public {

		ORDERS_ENABLED = false;
		emit LogOrdersDisabled();
	}

	function registerToken(address token) onlyOwner public;


	function enableTokenOrders(address token) onlyOwner public;
	function disableTokenOrders(address token) onlyOwner public;
}
