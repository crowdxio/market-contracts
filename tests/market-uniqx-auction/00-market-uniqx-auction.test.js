import {
	accounts, BigNumber, getBalanceAsync, getBalanceAsyncStr, parseAdaptTokenEvent, parseUniqxAuctionMarketEvent
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import latestTime from '../helpers/latestTime';
import { duration, increaseTimeTo } from "../../zeppelin/test/helpers/increaseTime";

const moment = require('moment');
import * as abiDecoder from 'abi-decoder';

const TokenAdapt = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const MarketUniqxAuction = artifacts.require('../../contracts/MarketUniqxAuction.sol');

const TokenAdaptJson = require("../../build/contracts/AdaptCollectibles.json");
const MarketUniqxAuctionJson = require('../../build/contracts/MarketUniqxAuction.json');

contract('Testing Auction listing - main flow', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let uniqxMarket;
	let tokenAdapt;

	const tokensCount = 11;
	let tokens = [];
	let buyPrices = [];
	let startPrices = [];
	let endTimes = [];

	it('should successfully deploy the market contract and the adapt token', async function () {

		console.log('Deploying the market contract...');

		uniqxMarket = await MarketUniqxAuction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${uniqxMarket.address}`);

		// MC: let's change to the generic ERC21 token instead of ADAPT
		tokenAdapt = await TokenAdapt.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${tokenAdapt.address}`);
	});

	it('should watch and parse the the logs', async function () {

		// market

		abiDecoder.addABI(MarketUniqxAuctionJson['abi']);

		const marketFilter = web3.eth.filter(
			{
				fromBlock: 1,
				toBlock: 'latest',
				address: uniqxMarket.address,
			}
		);

		marketFilter.watch(async (error, result ) => {
			if (error) {
				console.log(error);
				return;
			}
			const blockTimestamp = await web3.eth.getBlock(result['blockNumber']).timestamp;

			const events = abiDecoder.decodeLogs([result]);
			await parseUniqxAuctionMarketEvent(events[0], blockTimestamp);
		});


		// adapt

		abiDecoder.addABI(TokenAdaptJson['abi']);

		const tokenAdaptFilter = web3.eth.filter(
			{
				fromBlock: 1,
				toBlock: 'latest',
				address: tokenAdapt.address,
			}
		);

		tokenAdaptFilter.watch(async (error, result ) => {
			if (error) {
				console.log(error);
				return;
			}

			const events = abiDecoder.decodeLogs([result]);
			await parseAdaptTokenEvent(events[0]);
		});
	});


	it('should mint some test tokens', async function () {

		const ret = await tokenAdapt.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			tokensCount - 1,		// count
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;

		console.log(`GAS - Mass mint ${tokensCount - 1} adapt tokens: ${ret.receipt.gasUsed}`);
	});

	it('should register the adapt token', async function () {

		const rec = await uniqxMarket.registerToken(
			tokenAdapt.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogRegisterToken', { token: tokenAdapt.address });

		console.log(`GAS - Register Token: ${rec.receipt.gasUsed}`);
	});

	it('should allow the market to escrow the adapt tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await tokenAdapt.setApprovalForAll(
			uniqxMarket.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('should be able to list 10 adapt tokens for sale - auction format', async () => {

		const threeDaysLater = moment().add(3, 'days').unix();
		for (let i = 0; i < tokensCount - 1; i++) {
			tokens[i] = await tokenAdapt.tokenByIndex(i);
			buyPrices[i] = ether(9);
			startPrices[i] = ether(1);
			endTimes[i] = threeDaysLater;
		}

		const rec = await uniqxMarket.createMany(
			tokenAdapt.address,
			tokens,
			buyPrices,
			startPrices,
			endTimes,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - List for auction ${tokensCount - 1} adapt tokens: ${rec.receipt.gasUsed}`);

		const endTimeAsBNArray = [];
		for (const et of endTimes) {
			endTimeAsBNArray.push(new BigNumber(et));
		}

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			token: tokenAdapt.address,
			tokenIds: tokens,
			owners: Array(...Array(tokens.length)).map(() =>  ac.ADAPT_ADMIN),
			seller: ac.ADAPT_ADMIN,
			buyPrices: buyPrices,
			startPrices: startPrices,
			endTimes: endTimeAsBNArray
		});
	});

	it('should mint 1 test token', async function () {

		const ret = await tokenAdapt.mint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			11,				        // copy
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;

		console.log(`GAS - Mint 1 adapt tokens: ${ret.receipt.gasUsed}`);
	});

	it('should be able to list 1 token', async () => {

		const fourDaysLater = moment().add(4, 'days').unix();

		tokens[10] = await tokenAdapt.tokenByIndex(10);
		buyPrices[10] = ether(9);
		startPrices[10] = ether(1);

		let rec = await uniqxMarket.createMany(
			tokenAdapt.address,
			[ tokens[10] ],
			[ buyPrices[10] ],
			[ startPrices[10] ],
			[ fourDaysLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		console.log(`GAS - List for auction 1 adapt token: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			token: tokenAdapt.address,
			tokenIds: [ tokens[10] ],
			owners: [ ac.ADAPT_ADMIN ],
			seller: ac.ADAPT_ADMIN,
			buyPrices: [ buyPrices[10] ],
			startPrices: [ startPrices[10] ],
			endTimes: [ new BigNumber(fourDaysLater) ]
		});
	});

	it('should be able to cancel 2 tokens', async () => {
		const rec = await uniqxMarket.cancelMany(
			tokenAdapt.address,
			[tokens[0], tokens[1]],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - Cancel 2 adapt tokens: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCancelMany', {
			token: tokenAdapt.address,
			tokenIds: [ tokens[0], tokens[1] ]
		});

		// MC: should enforce the change in balance with an assert
		console.log(`Market balance: ${await getBalanceAsyncStr(ac.MARKET_FEES_MSIG)}`);
	});

	it('should be able to re-list 1 token after cancelled', async () => {

		const fourDaysLater = moment().add(4, 'days').unix();

		let rec = await uniqxMarket.createMany(
			tokenAdapt.address,
			[ tokens[0] ],
			[ ether(2) ],
			[ ether(1) ],
			[ fourDaysLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		console.log(`GAS - Re-list for auction 1 adapt token after it was cancel: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			token: tokenAdapt.address,
			tokenIds: [ tokens[0] ],
			owners: [ ac.ADAPT_ADMIN ],
			seller: ac.ADAPT_ADMIN,
			buyPrices: [ ether(2) ],
			startPrices: [ ether(1) ],
			endTimes: [ new BigNumber(fourDaysLater) ]
		});
	});

	it('BUYER1 should be able to place bids on 3 tokens', async function () {
		const tokens_ = [ tokens[2], tokens[3], tokens[4] ];
		const rec = await uniqxMarket.bidMany(
			tokenAdapt.address,
			tokens_,
			[ether(2), ether(2), ether(2)],
			{
				from: ac.BUYER1,
				value: ether(6),
				gas: 7000000
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(3);
		for (let i = 0; i < 3; i++) {
			await expectEvent.inLog(rec.logs[i], 'LogBid', {
				token: tokenAdapt.address,
				tokenId: tokens_[i],
				bidder: ac.BUYER1,
				bid: ether(2)
			});
		}


		console.log(`GAS - Bid 2 adapt tokens: ${rec.receipt.gasUsed}`);
	});

	it('BUYER2 should be able to overbid BUYER1', async function () {
		const rec = await uniqxMarket.bidMany(
			tokenAdapt.address,
			[tokens[4]],
			[ether(4)],
			{
				from: ac.BUYER2,
				value: ether(4),
				gas: 7000000
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogBid', {
			token: tokenAdapt.address,
			tokenId: tokens[4],
			bidder: ac.BUYER2,
			bid: ether(4)
		});

		console.log(`GAS - Bid 2 adapt tokens: ${rec.receipt.gasUsed}`);
	});


	it('BUYER2 should be able to place a bid big enough to buy the token', async function () {
		const rec = await uniqxMarket.bidMany(
			tokenAdapt.address,
			[tokens[5]],
			[ether(9)],
			{
				from: ac.BUYER2,
				value: ether(9),
				gas: 7000000
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(2);
		await expectEvent.inLog(rec.logs[0], 'LogBid', {
			token: tokenAdapt.address,
			tokenId: tokens[5],
			bidder: ac.BUYER2,
			bid: ether(9)
		});
		await expectEvent.inLog(rec.logs[1], 'LogBuy', {
			token: tokenAdapt.address,
			tokenId: tokens[5],
			buyer: ac.BUYER2
		});

		console.log(`GAS - Bid 2 adapt tokens: ${rec.receipt.gasUsed}`);
	});


	it('seek 3 days forward - should allow BUYER1 to finalize the auctions he won', async function () {
		const threeDaysLater = latestTime() + duration.days(3);
		await increaseTimeTo(threeDaysLater + duration.minutes(1));

		const tokens_ = [tokens[2], tokens[3]];
		const rec = await uniqxMarket.completeMany(
			tokenAdapt.address,
			tokens_,
			{
				from: ac.BUYER1,
				gas: 7000000
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(2);
		for (let i = 0; i < 2; i++) {
			await expectEvent.inLog(rec.logs[i], 'LogBuy', {
				token: tokenAdapt.address,
				tokenId: tokens_[i],
				buyer: ac.BUYER1
			});
		}
	});


	it('should allow BUYER2 to finalize the auctions he won', async function () {

		const rec = await uniqxMarket.completeMany(
			tokenAdapt.address,
			[tokens[4]],
			{
				from: ac.BUYER2,
				gas: 7000000
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogBuy', {
			token: tokenAdapt.address,
			tokenId: tokens[4],
			buyer: ac.BUYER2
		});
	});

	it('should allow the owner to take the unsold tokens back', async function () {
		const threeDaysLater = latestTime() + duration.days(3);
		await increaseTimeTo(threeDaysLater + duration.minutes(1));

		const rec = await uniqxMarket.completeMany(
			tokenAdapt.address,
			tokens.slice(6),
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(tokens.length - 6);
		for (let i = 0; i < tokens.length - 6; i++) {
			await expectEvent.inLog(rec.logs[i], 'LogRetake', {
				token: tokenAdapt.address,
				tokenId: tokens[6 + i],
			});
		}
	});
});
