pragma solidity ^0.4.24;

import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";
import {UniqxMarketBase} from "./UniqxMarketBase.sol";

contract UniqxMarketERC721Auction is UniqxMarketBase
{
	using SafeMath for uint;

	/////////////////////////////////////// CONSTANTS ///////////////////////////////////////
	uint constant AUCTION_MIN_DURATION = 1 hours;
	/////////////////////////////////////// TYPES ///////////////////////////////////////////
	struct OrderInfo {
		address owner; 		// the user who owns the token sold via this order
		uint buyPrice;		// holds the 'buy it now' price
		address buyer;		// holds the highest bidder
		uint startPrice; 	// holds the start price of an auction
		uint endTime;		// holds the time when the auction ends
		uint highestBid; 	// holds the highest bid at any given time
	}

	/////////////////////////////////////// EVENTS //////////////////////////////////////////
	event LogTokenListed(
		address token,
		uint tokenId,
		address owner,
		address seller,
		uint buyPrice,
		uint startPrice,
		uint endTime
	);
	event LogTokensListed(
		address token,
		uint[] tokenIds,
		address[] owners,
		address seller,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	);
	event LogBidPlaced(address token, uint tokenId, address bidder, uint bid);
	event LogBidsPlaced(address token, uint[] tokenIds, address bidder, uint[] bids);

	/////////////////////////////////////// VARIABLES ///////////////////////////////////////
	// TokenContract -> TokenId -> OrderInfo
	mapping(address => mapping(uint => OrderInfo)) orders;

	/////////////////////////////////////// MODIFIERS ///////////////////////////////////////
	/////////////////////////////////////// PUBLIC //////////////////////////////////////////
	constructor(
		address admin,
		address marketFeeCollector
	) public {

		MARKET_FEE_COLLECTOR = marketFeeCollector;
		transferOwnership(admin);
	}

	function tokenIsListed(address token, uint tokenId)
		public
		view
		returns(bool listed)
	{
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		OrderInfo storage order = orders[token][tokenId];

		return (order.owner != address(0x0));
	}

	function getOrderInfo(address token, uint tokenId)
		public
		view
		returns (
			address owner,
			uint buyPrice,
			address buyer,
			uint startPrice,
			uint endTime,
			uint highestBid
		)
	{
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		OrderInfo storage order = orders[token][tokenId];
		owner			= order.owner;
		buyPrice 		= order.buyPrice;
		buyer 			= order.buyer;
		startPrice 		= order.startPrice;
		endTime 		= order.endTime;
		highestBid 		= order.highestBid;
	}

	function listToken(
		address token,
		uint tokenId,
		uint buyPrice,
		uint startPrice,
		uint endTime
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		ERC721Token tokenInstance = ERC721Token(token);
		address owner = listTokenInternal(token, tokenInstance, tokenId, buyPrice, startPrice, endTime);

		emit LogTokenListed(
			token,
			tokenId,
			owner,
			msg.sender,
			buyPrice,
			startPrice,
			endTime
		);
	}

	function placeBid(
		address token,
		uint tokenId
	)
		whenNotPaused
		nonReentrant
		public
		payable
	{
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);
		placeBidInternal(token, tokenInstance, tokenId, msg.value);

		emit LogBidPlaced(token, tokenId, msg.sender, msg.value);
	}

	function cancelToken(
		address token,
		uint tokenId
	)
		whenNotPaused
		nonReentrant
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		cancelTokenInternal(token, tokenInstance, tokenId);

		emit LogTokenCancelled(token, tokenId);
	}

	function buyToken(
		address token,
		uint tokenId
	)
		whenNotPaused
		nonReentrant
		public
		payable
	{
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		uint tokenPrice = buyTokenInternal(token, tokenInstance, tokenId, 0);

		// the value should match the price of the token
		require(tokenPrice == msg.value);

		emit LogTokenSold(token, tokenId, msg.sender);
	}

	/////////////////////////////////////// MANY ////////////////////////////////////////////
	function listTokensAuction(
		address token,
		uint[] tokenIds,
		uint[] buyPrices,
		uint[] startPrices,
		uint[] endTimes
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public
	{
		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");
		require(tokenIds.length == startPrices.length, "Array lengths must match");
		require(tokenIds.length == endTimes.length, "Array lengths must match");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");

		ERC721Token tokenInstance = ERC721Token(token);
		address[] memory owners = new address[](tokenIds.length);
		for(uint i = 0; i < tokenIds.length; i++) {
			owners[i] = listTokenInternal(token, tokenInstance, tokenIds[i], buyPrices[i], startPrices[i], endTimes[i]);
		}

		emit LogTokensListed(
			token,
			tokenIds,
			owners,
			msg.sender,
			buyPrices,
			startPrices,
			endTimes
		);
	}

	function placeBids(
		address token,
		uint [] tokenIds,
		uint [] bids
	)
		whenNotPaused
		nonReentrant
		public
		payable
	{
		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == bids.length, "Array lengths must match");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		uint bidRunningSum = 0;
		for(uint i = 0; i < tokenIds.length; i++) {
			placeBidInternal(token, tokenInstance, tokenIds[i], bids[i]);
			bidRunningSum = bidRunningSum.add(bids[i]);
		}

		require(bidRunningSum == msg.value, "The amount passed must match the sum of the bids");

		emit LogBidsPlaced(token, tokenIds, msg.sender, bids);
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
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		uint priceRunningSum = 0;
		for(uint i = 0; i < tokenIds.length; i++) {
			uint tokenPrice = buyTokenInternal(token, tokenInstance, tokenIds[i], priceRunningSum);
			priceRunningSum = priceRunningSum.add(tokenPrice);
		}

		// the value should match the sum price of all tokoen
		require(priceRunningSum == msg.value);

		emit LogTokensSold(token, tokenIds, msg.sender);
	}

	// MC: isn't this better called cancelOrders ?
	// Can we do a separate branch for renaming and involve Solo as well?
	function cancelTokens(
		address token,
		uint[] tokenIds
	)
		whenNotPaused
		nonReentrant
		public
	{
		require(tokenIds.length > 0, "Array must have at least one entry");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		for(uint i = 0; i < tokenIds.length; i++) {
			cancelTokenInternal(token, tokenInstance, tokenIds[i]);
		}

		emit LogTokensCancelled(token, tokenIds);
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
		require(tokenIds.length > 0, "Array must have at least one entry");

		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = orders[token][tokenIds[i]];

			require(orderExists(order), "Token must be listed");
			require(now >= order.endTime, "Auction must be ended");

			if (order.highestBid > 0) {

				// transfer fee to market
				uint marketFee = order.highestBid.mul(marketFeeNum).div(marketFeeDen);
				MARKET_FEE_COLLECTOR.transfer(marketFee);

				// transfer the rest of the amount to the owner
				uint ownerDue = order.highestBid.sub(marketFee);
				order.owner.transfer(ownerDue);

				// transfer token to the highest bidder
				tokenInstance.transferFrom(address(this), order.buyer, tokenIds[i]);

				emit LogTokenSold(token, tokenIds[i], order.buyer);

			} else {

				// no bids, the token is unsold

				// transfer the token back to the owner
				tokenInstance.transferFrom(address(this), order.owner, tokenIds[i]);

				emit LogTokenUnsold(token, tokenIds[i]);
			}

			delete orders[token][tokenIds[i]];
		}
	}


	/////////////////////////////////////// INTERNAL ////////////////////////////////////////
	function orderExists(OrderInfo order)
		private
		pure
		returns(bool listed)
	{
		return (order.owner != address(0x0));
	}

	function listTokenInternal(
		address token,
		ERC721Token tokenInstance,
		uint tokenId,
		uint buyPrice,
		uint startPrice,
		uint endTime
	)
		private
		returns (address _owner)
	{
		OrderInfo storage order = orders[token][tokenId];
		require(!orderExists(order), "Token must not be listed already");
		require(buyPrice > 0, "Buy price must be greater than zero");
		require(startPrice <= buyPrice, "Start price must be less than or equal to the buy price");
		require(endTime > now + AUCTION_MIN_DURATION, "A minimum auction duration is enforced by the market");
		require(isSpenderApproved(msg.sender, token , tokenId), "The seller must be allowed to sell the token");

		// market will now escrow the token (owner and seller must approve uniqx market before listing)
		address owner = tokenInstance.ownerOf(tokenId);
		tokenInstance.transferFrom(owner, address(this), tokenId);

		OrderInfo memory newOrder = OrderInfo(
			{
				owner: owner,
				buyPrice: buyPrice,
				buyer: address(0),
				startPrice: startPrice,
				endTime: endTime,
				highestBid: 0
			}
		);

		orders[token][tokenId] = newOrder;

		return owner;
	}

	function placeBidInternal(
		address token,
		ERC721Token tokenInstance,
		uint tokenId,
		uint bid
	)
		private
	{
		OrderInfo storage order = orders[token][tokenId];
		require(orderExists(order), "Token must be listed");
		require(now <= order.endTime, "Action must be open");

		require(bid >= order.startPrice, "The bid must be greater than or equal to the start price");
		require(bid >  order.highestBid, "The bid must be greater than the current highest bid");
		require(bid <= order.buyPrice, "The bid must be less than or equal to the buy price");

		// refund the old bidder if there is any
		if (order.buyer != address(0)) {
			order.buyer.transfer(order.highestBid);
		}

		order.highestBid = bid;
		order.buyer = msg.sender;

		emit LogBidPlaced(token, tokenId, order.buyer, order.highestBid);

		// buy it now?
		if (bid == order.buyPrice) {

			// transfer fee to market
			uint marketFee = order.highestBid.mul(marketFeeNum).div(marketFeeDen);
			MARKET_FEE_COLLECTOR.transfer(marketFee);

			// transfer the rest of the amount to the owner
			uint ownerDue = order.highestBid.sub(marketFee);
			order.owner.transfer(ownerDue);

			// transfer token to buyer which is the same with sender and buyer
			tokenInstance.transferFrom(address(this), msg.sender, tokenId);

			emit LogTokenSold(token, tokenId, order.buyer);

			delete orders[token][tokenId];
		}
	}

	function buyTokenInternal(
		address token,
		ERC721Token tokenInstance,
		uint tokenId,
		uint ordersAmount
	)
		private
		returns (uint buyPrice)
	{
		OrderInfo storage order = orders[token][tokenId];

		require(orderExists(order), "Token must be listed");
		require(msg.value >= ordersAmount + order.buyPrice, "The amount passed must cover the value of the tokens as listed");
		buyPrice = order.buyPrice;

		// transfer fee to market
		uint marketFee = order.buyPrice.mul(marketFeeNum).div(marketFeeDen);
		MARKET_FEE_COLLECTOR.transfer(marketFee);

		// transfer the rest to owner
		uint ownerDue = order.buyPrice.sub(marketFee);
		order.owner.transfer(ownerDue);

		// transfer token to buyer
		tokenInstance.transferFrom(address(this), msg.sender, tokenId);

		delete orders[token][tokenId];
	}

	function cancelTokenInternal(
		address token,
		ERC721Token tokenInstance,
		uint tokenId
	)
		private
	{
		OrderInfo storage order = orders[token][tokenId];
		require(orderExists(order), "Token must be listed");

		require(
			msg.sender == order.owner
			|| tokenInstance.getApproved(tokenId) == msg.sender
			|| tokenInstance.isApprovedForAll(order.owner, msg.sender),
			"Only the owner or the seller can cancel a token"
		);

		// ended auctions cannot be canceled - these are called Unsold
		require(now < order.endTime, "Auction must be open");
		require(order.highestBid == 0, "Only zero bids auctions can be cancelled");

		// transfer the token back to the owner
		tokenInstance.transferFrom(address(this), order.owner, tokenId);

		delete orders[token][tokenId];
	}
}
