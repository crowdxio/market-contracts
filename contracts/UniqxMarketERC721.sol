pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/ReentrancyGuard.sol";
import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";

contract UniqxMarketERC721 is NoOwner, Pausable, ReentrancyGuard {

	using SafeMath for uint;

	address public MARKET_FEES_MSIG;

	bool public ORDERS_ENABLED = true;

	uint public marketFeeNum = 1;
	uint public marketFeeDen = 100;

	uint constant AUCTION_MIN_DURATION = 1 hours;

	enum OrderFormat {
		FixedPrice,
		Auction
	}

	enum OrderStatus {
		Unknown,
		Listed,			// token listed on owner's behalf
		Cancelled,		// order canceled on owner's behalf (some restrictions are applied on auction orders)
		Sold,			// token sold, the item goes to the buyer or to the highest bidder
		Unsold			// auction ended with zero bids, token goes back to owner
	}

	struct OrderInfo {

		// COMMON
		OrderFormat format;
		OrderStatus status;
		uint createdAt;
		uint updatedAt;
		address owner; 				// the user who owns the token sold via this order
		address seller; 			// the seller (must be approved by the owner before listing)
		uint buyPrice;				// holds the 'buy now' price

		// AUCTION ONLY
		uint startPrice; 			// holds the start price of an auction
		uint endTime;				// holds the time when the auction ends
		uint highestBid; 			// holds the highest bid at any given time
		address highestBidder;		// holds the address of the highest bidder

	}

	struct TokenContract {
		bool registered;
		bool ordersEnabled;
		mapping(uint => OrderInfo) orders;
	}

	mapping(address => TokenContract) tokenContracts;

	event LogOrdersEnabled();
  	event LogOrdersDisabled();

	event LogTokenRegistered(address token);

	event LogTokenOrdersEnabled(address token);
	event LogTokenOrdersDisabled(address token);

	modifier whenOrdersEnabled() {
		require(ORDERS_ENABLED);
		_;
	}

	modifier whenOrdersDisabled() {
		require(!ORDERS_ENABLED);
		_;
	}

	constructor(
		address admin,
		address marketFeesMsig
	) public {

		MARKET_FEES_MSIG = marketFeesMsig;
		transferOwnership(admin);
	}

	function setFee(uint _marketFeeNum, uint _marketFeeDen)
		onlyOwner
	public {

		marketFeeNum = _marketFeeNum;
		marketFeeDen = _marketFeeDen;
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

	function registerToken(address token)
		onlyOwner
	public {

		require(!tokenContracts[token].registered);

		TokenContract memory tokenContract = TokenContract(
			{
				registered: true,
				ordersEnabled: true
			}
		);

		tokenContracts[token] = tokenContract;
		emit LogTokenRegistered(token);
	}

	function enableTokenOrders(address token)
		onlyOwner
		public
	{

		TokenContract storage tokenContract = tokenContracts[token];

		// token contract must be registered
		require(tokenContract.registered);

		// orders must be disabled for this token
		require(!tokenContract.ordersEnabled);

		// really enable
		tokenContract.ordersEnabled = true;

		// log the change
		emit LogTokenOrdersEnabled(token);
	}


	function disableTokenOrders(address token)
		onlyOwner
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];

		// token contract must be registered
		require(tokenContract.registered);

		// orders must be enabled for this token
		require(tokenContract.ordersEnabled);

		// really enable
		tokenContract.ordersEnabled = false;

		// log the change
		emit LogTokenOrdersDisabled(token);
	}

	function isSpenderApproved(address spender, address token,  uint256 tokenId)
		internal
		view
		returns (bool)
	{
		TokenContract storage tokenContract = tokenContracts[token];

		// token contract must be registered
		require(tokenContract.registered);

		ERC721Token tokenInstance = ERC721Token(token);
		address owner = tokenInstance.ownerOf(tokenId);

		return (spender == owner
				|| tokenInstance.getApproved(tokenId) == spender
				|| tokenInstance.isApprovedForAll(owner, spender));
	}

	function getOrderStatus(address token, uint tokenId)
		public
		view
		returns (OrderStatus status)
	{

		TokenContract storage tokenContract = tokenContracts[token];

		// token contract must be registered
		require(tokenContract.registered);

		return tokenContract.orders[tokenId].status;
	}

/*
	function getOrderInfo(address _contract, uint _tokenId)
		public
		view
		returns (
			OrderStatus _status,
			address _maker,
			uint _makeMinPrice,
			uint _makeMaxPrice,
			uint _makeTime,
			uint _endTime,

			uint _bid,
			address _bidder
		)
	{

		UniqxMarketContract storage marketContract = contracts[_contract];
		require(marketContract.registered);

		AuctionInfo storage auction = marketContract.auctions[_tokenId];

		_status = auction.status;
		_maker = auction.maker;
		_makeMinPrice = auction.makeMinPrice;
		_makeMaxPrice = auction.makeMaxPrice;
		_makeTime = auction.makeTime;
		_endTime = auction.endTime;

		_bid = auction.highestBidValue;
		_bidder = auction.bidder;
	}
*/

	function listTokensAsAuctions(
		address token,
		uint[] tokenIds,
		uint[] startPrices,
		uint[] buyPrices,
		uint[] endTimes
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];

		// token contract must be registered
		require(tokenContract.registered);

		// orders must be enabled for this token
		require(tokenContract.ordersEnabled);

		// validate parameters
		require(tokenIds.length == startPrices.length);
		require(tokenIds.length == buyPrices.length);
		require(tokenIds.length == endTimes.length);

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			// make sure the token is not listed already
			require(order.status != OrderStatus.Listed);

			// start price should be smaller than the buy price
			require(startPrices[i] < buyPrices[i]);

			// enforce minimum duration
			require(endTimes[i] > now + AUCTION_MIN_DURATION);

			// make sure the seller is allowed to sell the token
			require(isSpenderApproved(msg.sender, token , tokenIds[i]));

			// market will now escrow the token (owner or seller must approve unix market before listing)
			ERC721Token tokenInstance = ERC721Token(token);
			address owner = tokenInstance.ownerOf(tokenIds[i]);
			tokenInstance.transferFrom(owner, address(this), tokenIds[i]);

			OrderInfo memory newOrder = OrderInfo(
				{
					format: OrderFormat.Auction,
					status: OrderStatus.Listed,
					createdAt: now,
					updatedAt: now,
					owner: owner,
					seller: msg.sender,
					buyPrice: buyPrices[i],
					startPrice: startPrices[i],
					endTime: endTimes[i],
					highestBid: 0,
					highestBidder: address(0)
				}
			);

			tokenContracts[token].orders[tokenIds[i]] = newOrder;
		}

		// TODO: add logging
	}

	function bidTokens(
		address token,
		uint [] tokenIds,
		uint [] bids
	)
		whenNotPaused
		nonReentrant
		public
		payable
	{
		TokenContract storage tokenContract = tokenContracts[token];

		// token contract must be registered
		require(tokenContract.registered);

		// validate parameters
		require(tokenIds.length == bids.length);

		uint bidAmount = 0;
		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			// make sure token is listed
			require(order.status == OrderStatus.Listed);

			// make sure the order is auction
			require(order.format == OrderFormat.Auction);

			// make sure the auction not ended yet
			require(now <= order.endTime);

			// bid must be higher than the the current highest bid and by the start price
			require(bids[i] > order.startPrice);
			require(bids[i] > order.highestBid);

			// refund the old bidder if there is any
			if (order.highestBidder != address(0)) {
				order.highestBidder.transfer(order.highestBid);
			}

			// update highest bid
			order.highestBid = bids[i];
			// update highest bidder
			order.highestBidder = msg.sender;
			// set the updated time
			order.updatedAt = now;

			bidAmount += bids[i];

			// buy it now?
			if (bids[i] >= order.buyPrice) {

				// transfer fee to market
				uint marketFee = order.highestBid.mul(marketFeeNum).div(marketFeeDen);
				MARKET_FEES_MSIG.transfer(marketFee);

				// transfer the rest of the amount to the owner
				uint ownerDue = order.highestBid.sub(marketFee);
				order.owner.transfer(ownerDue);

				// transfer token to buyer which is the same with sender and highestBidder
				ERC721Token tokenInstance = ERC721Token(token);
				tokenInstance.transferFrom(address(this), msg.sender, tokenIds[i]);

				// mark the order as sold
				order.status = OrderStatus.Sold;
				order.updatedAt = now;

				// TODO: emit event to log state change
			} else {
				// TODO: emit event to log state change
			}
		}

		require(bidAmount == msg.value);
	}


	function buyTokens(
		address token,
		uint [] tokenIds
	)
		whenNotPaused
		nonReentrant
		public
		payable
	{
		TokenContract storage tokenContract = tokenContracts[token];

		// token contract must be registered
		require(tokenContract.registered);

		uint ordersAmount = 0;
		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			// make sure token is listed
			require(order.status == OrderStatus.Listed);

			// make sure the list is fixed price type
			require(order.format == OrderFormat.FixedPrice);

			// the amount passed must cover the buy prices so far
			require(ordersAmount + order.buyPrice <= msg.value);

			// update the orders amount
			ordersAmount += order.buyPrice;

			// transfer fee to market
			uint marketFee = order.buyPrice.mul(marketFeeNum).div(marketFeeDen);
			MARKET_FEES_MSIG.transfer(marketFee);

			// transfer the rest to owner
			uint ownerDue = order.buyPrice.sub(marketFee);
			order.owner.transfer(ownerDue);

			// transfer token to buyer
			ERC721Token tokenInstance = ERC721Token(token);
			tokenInstance.transferFrom(address(this), msg.sender, tokenIds[i]);

			// mark the order as sold
			order.status = OrderStatus.Sold;
			order.updatedAt = now;

			// TODO: emit event to log state change
		}

		// the bundled value should match the price of all orders
		require(ordersAmount == msg.value);
	}

	function cancelOrders(
		address token,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		public
	{
		// make sure the token contract is registered
		TokenContract storage tokenContract = tokenContracts[token];

		// token contract must be registered
		require(tokenContract.registered);

		for(uint i=0; i< tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			// make sure token is listed
			require(order.status == OrderStatus.Listed);

			// only the owner or the seller can cancel an order
			require(
				msg.sender == order.seller ||
				msg.sender == order.owner
			);

			// few restrictions for auctions
			if (order.format == OrderFormat.Auction) {
				// ended auctions cannot be canceled - these are called Unsold
				require(now < order.endTime);

				// only zero bids auctions can be canceled - a bid is binding for both parties
				require(order.highestBid == 0);
			}

			// transfer the token back to the owner
			ERC721Token tokenInstance = ERC721Token(token);
			tokenInstance.transferFrom(address(this), order.owner, tokenIds[i]);

			// mark the order as cancelled
			order.status = OrderStatus.Cancelled;
			order.updatedAt = now;

			// TODO: emit event
		}
	}

	// this will move the auctions into final states (Sold/Unsold)
	// if there are winners it will really do the exchange (tokens <-> ETH)
	// otherwise it will just transfer the tokens back to the owners
	function finalizeAuctions(
		address token,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		public
	{
		// make sure the token contract is registered
		TokenContract storage tokenContract = tokenContracts[token];

		// token contract must be registered
		require(tokenContract.registered);

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			if (order.status != OrderStatus.Listed) {
				continue;
			}

			// stick to auctions
			if (order.format != OrderFormat.Auction){
				continue;
			}

			// skip the auctions which in progress
			if (now < order.endTime) {
				continue;
			}

			// okay we got to an ended auction

			ERC721Token tokenInstance = ERC721Token(token);

			if (order.highestBid > 0) {

				// we have a winner

				// transfer fee to market
				uint marketFee = order.highestBid.mul(marketFeeNum).div(marketFeeDen);
				MARKET_FEES_MSIG.transfer(marketFee);

				// transfer the rest of the amount to the owner
				uint ownerDue = order.highestBid.sub(marketFee);
				order.owner.transfer(ownerDue);

				// transfer token to the highest bidder
				tokenInstance.transferFrom(address(this), order.highestBidder, tokenIds[i]);

				// mark the order as sold
				order.status = OrderStatus.Sold;
				order.updatedAt = now;

				// TODO: emit event to log state change
			} else {

				// no bids, the token is unsold

				// transfer the token back to the owner
				tokenInstance.transferFrom(address(this), order.owner, tokenIds[i]);

				// mark the order as unsold
				order.status = OrderStatus.Unsold;
				order.updatedAt = now;

				// TODO: emit event to log state change
			}
		}
	}
}
