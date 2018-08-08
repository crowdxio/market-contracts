import {
	accounts, assert, BigNumber, getBalanceAsync, getBalanceAsyncStr
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import * as abiDecoder from 'abi-decoder';

const AdaptToken = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const UniqxMarketERC721 = artifacts.require('../../contracts/UniqxMarketERC721.sol');
const UniqxMarketERC721Json = require('../../build/contracts/UniqxMarketERC721.json');

contract('Testing FixedPrice listing - main flow', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let unixMarket;
	let adaptToken;

	const tokensCount = 10;
	let tokens = [];
	let prices = [];

	it('should successfully deploy the market contract and the adapt token', async function () {

		console.log('Deploying the market contract...');

		unixMarket = await UniqxMarketERC721.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${unixMarket.address}`);

		adaptToken = await AdaptToken.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${adaptToken.address}`);
	});

	it('should mint some test tokens', async function () {
		const ret = await adaptToken.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			tokensCount,		    // count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await adaptToken.tokenByIndex(i);
			prices[i] = ether(1);
		}

		console.log(`GAS - Mass mint ${tokensCount} adapt tokens: ${ret.receipt.gasUsed}`);
	});

	it('should register the adapt token', async function () {

		const ret = await unixMarket.registerToken(
			adaptToken.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogTokenRegistered');

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);
	});


	it('should allwo the market to escrow the adapt tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await adaptToken.setApprovalForAll(
			unixMarket.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});


	it('should be able to list 10 adapt tokens for sale - fixed price', async () => {
		const rec = await unixMarket.listTokensFixedPrice(
			adaptToken.address,
			tokens,
			prices,
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - List ${tokensCount} adapt tokens fixed price: ${rec.receipt.gasUsed}`);

		expectEvent.inLogs(rec.logs, 'LogTokensListedFixedPrice');
	});

	it('should be able to cancel 2 tokens', async () => {
		const rec = await unixMarket.cancelTokens(
			adaptToken.address,
			[tokens[0], tokens[1]],
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - Cancel 2 adapt tokens: ${rec.receipt.gasUsed}`);

		expectEvent.inLogs(rec.logs, 'LogTokensCanceled');

		console.log(`Market balance: ${await getBalanceAsyncStr(ac.MARKET_FEES_MSIG)}`);
	});

	it('should be able to buy 8 tokens', async () => {

		const tokensToBuy = tokens.slice(2);
		//console.log(`Tokens to buy: ${JSON.stringify(tokensToBuy)}`);
		const priceToPay = new BigNumber(ether(8));
		const marketFee = priceToPay.dividedToIntegerBy(100);
		const ownerDue = priceToPay - marketFee;

		const ownerBalanceBefore = await getBalanceAsync(ac.ADAPT_ADMIN);
		const marketBalanceBefore = await getBalanceAsync(ac.MARKET_FEES_MSIG);

		console.log(`priceToPay: ${priceToPay.toString(10)}`);
		console.log(`marketFee: ${marketFee.toString(10)}`);
		console.log(`ownerDue: ${ownerDue.toString(10)}`);
		console.log(`ownerBalanceBefore: ${ownerBalanceBefore.toString(10)}`);
		console.log(`marketBalanceBefore: ${marketBalanceBefore.toString(10)}`);

		const ret = await unixMarket.buyTokens(
			adaptToken.address,
			tokensToBuy,
			{
				from: ac.BUYER1,
				value: priceToPay,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogTokenSold');

		for (let token of tokensToBuy) {
			const owner = await adaptToken.ownerOf(token);
			assert.equal(owner, ac.BUYER1, 'owner should be buyer1');
		}

		const marketBalanceAfter = await getBalanceAsync(ac.MARKET_FEES_MSIG);
		marketBalanceAfter.should.be.bignumber.equal(marketBalanceBefore.plus(marketFee));

		const ownerBalanceAfter = await getBalanceAsync(ac.ADAPT_ADMIN);
		ownerBalanceAfter.should.be.bignumber.equal(ownerBalanceBefore.plus(ownerDue));

		console.log(`Market balance: ${await getBalanceAsyncStr(ac.MARKET_FEES_MSIG)}`);

		console.log(`GAS - Buy 8 adapt tokens: ${ret.receipt.gasUsed}`);
	});

	it('watch the market logs', async function () {
		abiDecoder.addABI(UniqxMarketERC721Json['abi']);

		const filter = web3.eth.filter(
			{
				fromBlock: 1,
				toBlock: 'latest',
				address: unixMarket.address,
			}
		);

		filter.watch(async (error, result ) => {
			if (error) {
				console.log(error);
				return;
			}

			const events = abiDecoder.decodeLogs([result]);
			await parseEvent(events[0]);
		})
	});
});


async function parseEvent(event) {

	//console.log(JSON.stringify(event, null, '\t'));

	const name = event['name'];
	const parameters = event['events']; // it's called events for some reason...

	switch (name) {
		case 'LogTokensListedFixedPrice': {

			const token         = parameters[0].value;
			const tokenIds      = parameters[1].value;
			const listTime      = parameters[2].value;
			const owner         = parameters[3].value;
			const seller        = parameters[4].value;
			const buyPrices     = parameters[5].value;

			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i]);
				console.log(`Token Listed: token=${token}, tokenId=0x${tokenId.toString(16)}, listedAt=${moment.unix(listTime).utc().format()}, owner=${owner}, seller=${seller}, buyPrices=${buyPrices[i]}`);
			}
			break;
		}

		case 'LogTokensCanceled': {
			const token         = parameters[0].value;
			const tokenIds      = parameters[1].value;
			const cancelTime    = parameters[2].value;

			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i]);
				console.log(`Token Canceled: token=${token}, tokenId=0x${tokenId.toString(16)}, cancelledAt=${moment.unix(cancelTime).utc().format()}`);
			}
			break;
		}

		case 'LogTokenSold': {
			const token         = parameters[0].value;
			const tokenId       = new BigNumber(parameters[1].value);
			const buyer         = parameters[2].value;
			const price         = parameters[3].value;
			const soldTime      = parameters[4].value;
			console.log(`Token Sold: token=${token}, tokenId=0x${tokenId.toString(16)}, buyer=${buyer}, price=${price}, soldAt=${moment.unix(soldTime).utc().format()}`);
			break;
		}
		default:
			console.log(`Skipping event ${name}...`);
	}
}