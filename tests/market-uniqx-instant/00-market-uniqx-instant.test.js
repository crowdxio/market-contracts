import {
	accounts,
	assert,
	BigNumber,
	getBalanceAsync,
	getBalanceAsyncStr,
	parseAdaptTokenEvent,
	parseUniqxInstantMarketEvent
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import * as abiDecoder from 'abi-decoder';

const TokenErc721 = artifacts.require("../../contracts/ERC721TokenMock.sol");
const MarketUniqxInstant = artifacts.require('../../contracts/MarketUniqxInstant.sol');

contract('Testing FixedPrice listing - main flow', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	const tokensCount = 11;
	let tokens = [];
	let prices = [];

	it('should successfully deploy the market contract and the erc721 token', async function () {

		console.log('Deploying the market contract...');

		market = await MarketUniqxInstant.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${market.address}`);

		tokenErc721 = await TokenErc721.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log(`The erc721 token has been successfully deployed at ${tokenErc721.address}`);
	});

	it('should watch and parse the logs', async function () {

		// market
		abiDecoder.addABI(MarketUniqxInstant.abi);
		// MC: is it worth having the same instance of the abiDecoder according to the problems we discovered on it ?

		const marketFilter = web3.eth.filter(
			{
				fromBlock: 1,
				toBlock: 'latest',
				address: market.address,
			}
		);

		marketFilter.watch(async (error, result ) => {
			if (error) {
				console.log(error);
				return;
			}

			const events = abiDecoder.decodeLogs([result]);
			const blockTimestamp = await web3.eth.getBlock(result['blockNumber']).timestamp;
			await parseUniqxInstantMarketEvent(events[0], blockTimestamp);
		});

		// adapt
		abiDecoder.addABI(TokenErc721.abi);

		const tokenAdaptFilter = web3.eth.filter(
			{
				fromBlock: 1,
				toBlock: 'latest',
				address: tokenErc721.address,
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

		for (let i = 0; i < tokensCount - 1; i++) {
			await tokenErc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}
	});

	it('should register the erc721 token', async function () {

		const ret = await market.registerToken(
			tokenErc721.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogRegisterToken', {
			erc721: tokenErc721.address
		});

		const status = await market.getTokenFlags(tokenErc721.address);
		assert.equal(status[0], true, 'unexpected registration status - should be registered');
		assert.equal(status[0], true, 'unexpected orders status - should be enabled');
	});


	it('should allow the market to escrow the erc721 tokens', async function () {
		// approve market to transfer all eerc721 tokens hold by admin
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});


	it('should be able to list 10 erc721 tokens for sale - fixed price', async () => {

		for (let i = 0; i < tokensCount - 1; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			prices[i] = ether(1);
		}

		const rec = await market.createMany(
			tokenErc721.address,
			tokens,
			prices,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - List ${tokensCount - 1} erc721 tokens - fixed price: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: tokens,
			owners: Array(...Array(tokens.length)).map(() =>  ac.ADAPT_ADMIN),
			seller: ac.ADAPT_ADMIN,
			buyPrices: prices,
		});
	});

	it('should mint 1 test token', async function () {

		const ret = await tokenErc721.mint(ac.ADAPT_ADMIN, 10, {
			from: ac.ADAPT_ADMIN
		}).should.be.fulfilled;
	});

	it('should be able to list 1 token - fixed price', async () => {

		tokens[10] = await tokenErc721.tokenByIndex(10);
		prices[10] = ether(1);

		let rec = await market.create(
			tokenErc721.address,
			tokens[10],
			prices[10],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		console.log(`GAS - List 1 erc721 token - fixed price: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreate', {
			erc721: tokenErc721.address,
			tokenId: tokens[10],
			owner: ac.ADAPT_ADMIN,
			seller: ac.ADAPT_ADMIN,
			buyPrice: prices[10]
		});
	});

	it('should be able to cancel 2 tokens', async () => {

		const balance1 = await getBalanceAsyncStr(ac.MARKET_FEES_MSIG);
		const rec = await market.cancelMany(
			tokenErc721.address,
			[tokens[0], tokens[1]],
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
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

		let rec = await market.createMany(
			tokenErc721.address,
			[ tokens[0] ],
			[ prices[0] ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		console.log(`GAS - Re-list for fixed price 1 erc721 token after it was cancel: ${rec.receipt.gasUsed}`);

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogCreateMany', {
			erc721: tokenErc721.address,
			tokenIds: [ tokens[0] ],
			owners: [ ac.ADAPT_ADMIN ],
			seller: ac.ADAPT_ADMIN,
			buyPrices: [ prices[0] ]
		});
	});

	it('should be able to buy 9 tokens', async () => {

		const tokensToBuy = tokens.slice(2);
		//console.log(`Tokens to buy: ${JSON.stringify(tokensToBuy)}`);
		const priceToPay = new BigNumber(ether(9));
		const marketFee = priceToPay.dividedToIntegerBy(100);
		const ownerDue = priceToPay - marketFee;

		const ownerBalanceBefore = await getBalanceAsync(ac.ADAPT_ADMIN);
		const marketBalanceBefore = await getBalanceAsync(ac.MARKET_FEES_MSIG);

		console.log(`priceToPay: ${priceToPay.toString(10)}`);
		console.log(`marketFee: ${marketFee.toString(10)}`);
		console.log(`ownerDue: ${ownerDue.toString(10)}`);
		console.log(`ownerBalanceBefore: ${ownerBalanceBefore.toString(10)}`);
		console.log(`marketBalanceBefore: ${marketBalanceBefore.toString(10)}`);

		const ret = await market.buyMany(
			tokenErc721.address,
			tokensToBuy,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBuyMany', {
			erc721: tokenErc721.address,
			tokenIds: tokensToBuy,
			buyer: ac.BUYER1,
		});

		for (let token of tokensToBuy) {
			const owner = await tokenErc721.ownerOf(token);
			assert.equal(owner, ac.BUYER1, 'owner should be buyer1');
		}

		const marketBalanceAfter = await getBalanceAsync(ac.MARKET_FEES_MSIG);
		marketBalanceAfter.should.be.bignumber.equal(marketBalanceBefore.plus(marketFee));

		const ownerBalanceAfter = await getBalanceAsync(ac.ADAPT_ADMIN);
		ownerBalanceAfter.should.be.bignumber.equal(ownerBalanceBefore.plus(ownerDue));

		console.log(`Market balance: ${await getBalanceAsyncStr(ac.MARKET_FEES_MSIG)}`);
		console.log(`GAS - Buy 9 erc721 tokens: ${ret.receipt.gasUsed}`);
	});
});
