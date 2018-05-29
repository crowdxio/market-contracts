pragma solidity ^0.4.21;

import "../zeppelin/contracts/ownership/Ownable.sol";
import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/math/SafeMath.sol";
import "../zeppelin/contracts/token/ERC721/ERC721BasicToken.sol";

contract UniqxMarketAdapt is NoOwner, Pausable {

	using SafeMath for uint;

	address public MARKET_ADMIN_MSIG;
	address public MARKET_FEES_MSIG;
	ERC721BasicToken public AdaptToken;

	uint public RESERVATION_TIME = 3 days;

	uint public MARKET_FEE_NUM = 4;
	uint public MARKET_FEE_DEN = 100;

	event LogTokensPublished(uint []tokens);

	enum TokenStatus {
		Unknown,
		Published,
		Reserved,
		Acquired
	}

	struct NftToken {
		uint publishPrice;
		uint publishTime;
		uint acquirePrice;
		uint acquireTime;
		address seller;
	}

	mapping(uint => NftToken) tokens;
	mapping(uint => address) reservations;

	constructor(
		address _marketAdmin,
		address _marketFees,
		address _adaptContract
	) public {

		MARKET_ADMIN_MSIG = _marketAdmin;
		MARKET_FEES_MSIG = _marketFees;
		AdaptToken = ERC721BasicToken(_adaptContract);

		transferOwnership(_marketAdmin);
	}

	function getTokenStatus(uint _tokenId) public view
		returns (TokenStatus _status) {

		NftToken storage nftToken = tokens[_tokenId];

		if(nftToken.publishTime == 0) {
			return TokenStatus.Unknown;
		}

		if(nftToken.acquirePrice == 0) {
			if(reservations[_tokenId] != address(0x0) &&
				nftToken.publishTime + RESERVATION_TIME > now) {
				return TokenStatus.Reserved;
			} else {
				return TokenStatus.Published;
			}
		}

		return TokenStatus.Acquired;
	}

	function getTokenInfo(uint _tokenId) public view
		returns (
			TokenStatus _status,
			uint _publishPrice,
			uint _publishTime,
			uint _acquirePrice,
			uint _acquireTime,
			address _seller
		) {

		_status = getTokenStatus(_tokenId);

		NftToken storage nftToken = tokens[_tokenId];
		_publishPrice = nftToken.publishPrice;
		_publishTime = nftToken.publishTime;
		_acquirePrice = nftToken.acquirePrice;
		_acquireTime = nftToken.acquireTime;
		_seller = nftToken.seller;
	}

	function getReservation(uint _tokenId) public view
		returns (address beneficiary) {

		return reservations[_tokenId];
	}

	function isSpenderApproved(address _spender, uint256 _tokenId) internal view returns (bool) {
		address tokenOwner = AdaptToken.ownerOf(_tokenId);

		return _spender == tokenOwner ||
		AdaptToken.getApproved(_tokenId) == _spender ||
		AdaptToken.isApprovedForAll(tokenOwner, _spender);
	}

	function publish(
			uint [] _tokenIds,
			uint [] _prices,
			address[] _reservations)
		public whenNotPaused {

		require(_tokenIds.length == _prices.length);
		require(_tokenIds.length == _reservations.length);

		for(uint index=0; index<_tokenIds.length; index++) {
			// this token is not already published
			require(tokens[_tokenIds[index]].publishTime == 0);
			// make sure the seller is approved to publish this item
			require(isSpenderApproved(msg.sender, _tokenIds[index]));

			// take temporary custody of the token
			address tokenOwner = AdaptToken.ownerOf(_tokenIds[index]);
			AdaptToken.transferFrom(tokenOwner, address(this), _tokenIds[index]);

			NftToken memory nftToken = NftToken({
					publishPrice: _prices[index],
					publishTime: now,
					acquirePrice: 0,
					acquireTime: 0,
					seller: msg.sender
				});
			tokens[_tokenIds[index]] = nftToken;

			if(_reservations[index] != address(0x0)) {
				reservations[_tokenIds[index]] = _reservations[index];
			}
		}
	}

	function acquire(uint _tokenId)
		public payable whenNotPaused {

		NftToken storage nftToken = tokens[_tokenId];
		require(nftToken.publishPrice > 0);
		require(nftToken.acquirePrice == 0);
		require(msg.value >= nftToken.publishPrice);
		require(isSpenderApproved(msg.sender, _tokenId));

		if(reservations[_tokenId] != address(0x0) &&
			nftToken.publishTime + RESERVATION_TIME > now ) {
			require(msg.sender == reservations[_tokenId]);
		}

		uint marketFee = msg.value.mul(MARKET_FEE_NUM).div(MARKET_FEE_DEN);
		uint sellerDue = msg.value.sub(marketFee);

		AdaptToken.transferFrom(address(this), msg.sender, _tokenId);
		MARKET_FEES_MSIG.transfer(marketFee);
		nftToken.seller.transfer(sellerDue);
	}
}
