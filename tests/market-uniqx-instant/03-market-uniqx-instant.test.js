import {
	accounts,
	assert,
	BigNumber,
	getBalanceAsync
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";

const TokenErc721 = artifacts.require("../../contracts/ERC721TokenMock.sol");
const MarketUniqxInstant = artifacts.require('../../contracts/MarketUniqxInstant.sol');

contract('Testing buy now functionality - many', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	const tokensCount = 10;
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

	it('should mint some test tokens', async function () {

		for (let i = 0; i < tokensCount; i++) {
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

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogRegisterToken', {
			erc721: tokenErc721.address
		});

		const status = await market.getTokenFlags(tokenErc721.address);
		assert.equal(status[0], true, 'unexpected registration status - should be registered');
		assert.equal(status[0], true, 'unexpected orders status - should be enabled');
	});


	it('ADAPT_ADMIN should allow the market to escrow his tokens', async function () {
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


	it('ADAPT_ADMIN should be able to list 10 erc721 tokens for sale - fixed price', async () => {

		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			prices[i] = ether(1);
		}

		const rec = await market.createMany(
			tokenErc721.address,
			tokens,
			prices,
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('BUYER1 should not be able to buy zero tokens', async function () {
		const priceToPay = new BigNumber(ether(10));

		const ret = await market.buyMany(
			tokenErc721.address,
			[],
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to buy the tokens - not enough ether', async function () {
		const priceToPay = new BigNumber(ether(1));

		const ret = await market.buyMany(
			tokenErc721.address,
			tokens,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to buy the tokens - too much ether', async function () {
		const priceToPay = new BigNumber(ether(11));

		const ret = await market.buyMany(
			tokenErc721.address,
			tokens,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to buy 10 tokens', async () => {

		const ownerBalanceBefore = await getBalanceAsync(ac.ADAPT_ADMIN);
		const marketBalanceBefore = await getBalanceAsync(ac.MARKET_FEES_MSIG);

		const priceToPay = new BigNumber(ether(10));

		const ret = await market.buyMany(
			tokenErc721.address,
			tokens,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - Buy 10 erc721 tokens: ${ret.receipt.gasUsed}`);

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBuyMany', {
			erc721: tokenErc721.address,
			tokenIds: tokens,
			buyer: ac.BUYER1,
		});

		const marketFeeNum = await market.marketFeeNum.call();
		const marketFeeDen = await market.marketFeeDen.call();
		const feePercent = marketFeeNum.div(marketFeeDen);
		const marketFee = priceToPay.mul(feePercent);
		const ownerDue = priceToPay - marketFee;

		const marketBalanceAfter = await getBalanceAsync(ac.MARKET_FEES_MSIG);
		const ownerBalanceAfter = await getBalanceAsync(ac.ADAPT_ADMIN);

		marketBalanceAfter.should.be.bignumber.equal(marketBalanceBefore.plus(marketFee));
		ownerBalanceAfter.should.be.bignumber.equal(ownerBalanceBefore.plus(ownerDue));

		for (let token of tokens) {
			assert.equal(await tokenErc721.ownerOf(token), ac.BUYER1, 'unexpected owner  - should be buyer1');
		}
	});

	it('BUYER2 should not be able to buy the tokens - tokens already sold to buyer1', async function () {
		const priceToPay = new BigNumber(ether(10));

		const ret = await market.buyMany(
			tokenErc721.address,
			tokens,
			{
				from: ac.BUYER2,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
