import {
	accounts,
	BigNumber,
	getBalanceAsyncStr,
} from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
import latestTime from '../helpers/latestTime';
import { duration, increaseTimeTo } from 'openzeppelin-solidity/test/helpers/increaseTime';

const moment = require('moment');

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxAuction = artifacts.require('MarketUniqxAuction');

contract('Testing Auction listing - main flow', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let uniqxMarket;
	let tokenErc721;

	const tokensCount = 11;
	let tokens = [];
	let buyPrices = [];
	let startPrices = [];
	let endTimes = [];

	it('should successfully deploy the market contract and the erc721 token', async() => {

		console.log('Deploying the market contract...');

		uniqxMarket = await MarketUniqxAuction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${uniqxMarket.address}`);

		tokenErc721 = await TokenErc721.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR}
		).should.be.fulfilled;

		console.log(`The erc721 token has been successfully deployed at ${tokenErc721.address}`);
	});

	it('should mint some test tokens', async() => {

		for (let i = 0; i < tokensCount - 1; i++) {
			const ret = await tokenErc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}

	});

	it('should register the erc721 token', async() => {

		const rec = await uniqxMarket.registerToken(
			tokenErc721.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogRegisterToken', { erc721: tokenErc721.address });

		console.log(`GAS - Register Token: ${rec.receipt.gasUsed}`);
	});

	it('should allow the market to escrow the erc721 tokens', async() => {
		// approve market to transfer all erc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			uniqxMarket.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;
	});

	it('should be able to list 10 erc721 tokens for sale - auction format', async () => {

		const threeDaysLater = moment().add(3, 'days').unix();
		for (let i = 0; i < tokensCount - 1; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			buyPrices[i] = ether(9);
			startPrices[i] = ether(1);
			endTimes[i] = threeDaysLater;
		}

		const rec = await uniqxMarket.createMany(
			tokenErc721.address,
			tokens,
			buyPrices,
			startPrices,
			endTimes,
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;

		console.log(`GAS - List for auction ${tokensCount - 1} erc721 tokens: ${rec.receipt.gasUsed}`);

		const endTimeAsBNArray = [];
		for (const et of endTimes) {
			endTimeAsBNArray.push(new BigNumber(et));
		}

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: tokens,
			owners: Array(...Array(tokens.length)).map(() =>  ac.ADAPT_ADMIN),
			seller: ac.ADAPT_ADMIN,
			buyPrices: buyPrices,
			startPrices: startPrices,
			endTimes: endTimeAsBNArray
		});
	});

	it('should mint 1 test token', async() => {

		const ret = await tokenErc721.mint(ac.ADAPT_ADMIN, 10, {
			from: ac.ADAPT_ADMIN
		}).should.be.fulfilled;
	});

	it('should be able to list 1 token', async () => {

		const fourDaysLater = moment().add(4, 'days').unix();

		tokens[10] = await tokenErc721.tokenByIndex(10);
		buyPrices[10] = ether(9);
		startPrices[10] = ether(1);

		let rec = await uniqxMarket.createMany(
			tokenErc721.address,
			[ tokens[10] ],
			[ buyPrices[10] ],
			[ startPrices[10] ],
			[ fourDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		console.log(`GAS - List for auction 1 erc721 token: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[10] ],
			owners: [ ac.ADAPT_ADMIN ],
			seller: ac.ADAPT_ADMIN,
			buyPrices: [ buyPrices[10] ],
			startPrices: [ startPrices[10] ],
			endTimes: [ new BigNumber(fourDaysLater) ]
		});
	});

	it('should be able to cancel 2 tokens', async () => {

		const balance1 = await getBalanceAsyncStr(ac.MARKET_FEES_MSIG);
		const rec = await uniqxMarket.cancelMany(
			tokenErc721.address,
			[tokens[0], tokens[1]],
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;

		console.log(`GAS - Cancel 2 erc721 tokens: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCancelMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[0], tokens[1] ]
		});

		const balance2 = await getBalanceAsyncStr(ac.MARKET_FEES_MSIG);
		balance2.should.be.bignumber.equal(balance1);
		console.log(`Market balance: ${balance2}`);
	});

	it('should be able to re-list 1 token after cancelled', async () => {

		const fourDaysLater = moment().add(4, 'days').unix();

		let rec = await uniqxMarket.createMany(
			tokenErc721.address,
			[ tokens[0] ],
			[ ether(2) ],
			[ ether(1) ],
			[ fourDaysLater ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		console.log(`GAS - Re-list for auction 1 erc721 token after it was cancel: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[0] ],
			owners: [ ac.ADAPT_ADMIN ],
			seller: ac.ADAPT_ADMIN,
			buyPrices: [ ether(2) ],
			startPrices: [ ether(1) ],
			endTimes: [ new BigNumber(fourDaysLater) ]
		});
	});

	it('BUYER1 should be able to place bids on 3 tokens', async() => {
		const tokens_ = [ tokens[2], tokens[3], tokens[4] ];
		const rec = await uniqxMarket.bidMany(
			tokenErc721.address,
			tokens_,
			[ether(2), ether(2), ether(2)],
			{
				from: ac.BUYER1,
				value: ether(6),
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(3);
		for (let i = 0; i < 3; i++) {
			await expectEvent.inLog(rec.logs[i], 'LogBid', {
				erc721: tokenErc721.address,
				tokenId: tokens_[i],
				bidder: ac.BUYER1,
				bid: ether(2)
			});
		}


		console.log(`GAS - Bid 2 erc721 tokens: ${rec.receipt.gasUsed}`);
	});

	it('BUYER2 should be able to overbid BUYER1', async() => {
		const rec = await uniqxMarket.bidMany(
			tokenErc721.address,
			[tokens[4]],
			[ether(4)],
			{
				from: ac.BUYER2,
				value: ether(4),
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogBid', {
			erc721: tokenErc721.address,
			tokenId: tokens[4],
			bidder: ac.BUYER2,
			bid: ether(4)
		});

		console.log(`GAS - Bid 2 erc721 tokens: ${rec.receipt.gasUsed}`);
	});

	it('BUYER2 should be able to place a bid big enough to buy the token', async() => {
		const rec = await uniqxMarket.bidMany(
			tokenErc721.address,
			[tokens[5]],
			[ether(9)],
			{
				from: ac.BUYER2,
				value: ether(9),
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(2);
		await expectEvent.inLog(rec.logs[0], 'LogBid', {
			erc721: tokenErc721.address,
			tokenId: tokens[5],
			bidder: ac.BUYER2,
			bid: ether(9)
		});
		await expectEvent.inLog(rec.logs[1], 'LogBuy', {
			erc721: tokenErc721.address,
			tokenId: tokens[5],
			buyer: ac.BUYER2
		});

		console.log(`GAS - Bid 2 erc721 tokens: ${rec.receipt.gasUsed}`);
	});


	it('seek 3 days forward - should allow BUYER1 to finalize the auctions he won', async() => {
		const threeDaysLater = latestTime() + duration.days(3);
		await increaseTimeTo(threeDaysLater + duration.minutes(1));

		const tokens_ = [tokens[2], tokens[3]];
		const rec = await uniqxMarket.completeMany(
			tokenErc721.address,
			tokens_,
			{
				from: ac.BUYER1,
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(2);
		for (let i = 0; i < 2; i++) {
			await expectEvent.inLog(rec.logs[i], 'LogBuy', {
				erc721: tokenErc721.address,
				tokenId: tokens_[i],
				buyer: ac.BUYER1
			});
		}
	});


	it('should allow BUYER2 to finalize the auctions he won', async() => {

		const rec = await uniqxMarket.completeMany(
			tokenErc721.address,
			[tokens[4]],
			{
				from: ac.BUYER2,
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogBuy', {
			erc721: tokenErc721.address,
			tokenId: tokens[4],
			buyer: ac.BUYER2
		});
	});

	it('should allow the owner to take the unsold tokens back', async() => {
		const threeDaysLater = latestTime() + duration.days(3);
		await increaseTimeTo(threeDaysLater + duration.minutes(1));

		const rec = await uniqxMarket.completeMany(
			tokenErc721.address,
			tokens.slice(6),
			{
				from: ac.ADAPT_ADMIN,
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(tokens.length - 6);
		for (let i = 0; i < tokens.length - 6; i++) {
			await expectEvent.inLog(rec.logs[i], 'LogRetake', {
				erc721: tokenErc721.address,
				tokenId: tokens[6 + i],
			});
		}
	});
});
