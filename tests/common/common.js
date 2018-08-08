const moment = require('moment');

export function accounts(rpc_accounts) {
	return {
		OPERATOR: rpc_accounts[0],
		MARKET_ADMIN_MSIG: rpc_accounts[1],
		MARKET_FEES_MSIG: rpc_accounts[2],

		ADAPT_OWNER: rpc_accounts[3],
		ADAPT_ADMIN: rpc_accounts[4],
		BUYER1: rpc_accounts[5],
		BUYER2: rpc_accounts[6],
		ACCOUNT1: rpc_accounts[7],
		ACCOUNT2: rpc_accounts[8],
		ACCOUNT3: rpc_accounts[9],
		BUYER3: rpc_accounts[10]
	};
}

export function printTime(timestamp) {
	console.log('Timestamp is: ', JSON.stringify(timestamp));
	console.log('Time is: ', moment.unix(timestamp).utc().format());
}

const Bluebird = require('bluebird');
const BigNumber = web3.BigNumber;
const assert = require('chai').assert;
const should = require('chai')
	.use(require('chai-as-promised'))
	.use(require('chai-bignumber')(BigNumber))
	.should();

const getBalanceAsync = Bluebird.promisify(web3.eth.getBalance);

export async function getBalanceAsyncStr(address, base = 10) {
	return (await getBalanceAsync(address)).toString(base);
}

const OrderStatus = {
	Unknown: 0,
	Published: 1,
	Cancelled: 2,
	Acquired: 3,
	Reserved: 4,
};


async function parseUnixMarketEvent(event) {

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
				console.log(`Token Listed FixedPrice: token=${token}, tokenId=0x${tokenId.toString(16)}, listedAt=${moment.unix(listTime).utc().format()}, owner=${owner}, seller=${seller}, buyPrices=${buyPrices[i]}`);
			}
			break;
		}

		case 'LogTokensListedAuction': {
			const token         = parameters[0].value;
			const tokenIds      = parameters[1].value;
			const listTime      = parameters[2].value;
			const owner         = parameters[3].value;
			const seller        = parameters[4].value;
			const buyPrices     = parameters[5].value;
			const endPrices     = parameters[6].value;
			const endTimes      = parameters[7].value;

			const tokensCount = tokenIds.length;
			for(let i = 0; i < tokensCount; i++) {
				const tokenId = new BigNumber(tokenIds[i]);
				console.log(`Token Listed Auction: token=${token}, tokenId=0x${tokenId.toString(16)}, listedAt=${moment.unix(listTime).utc().format()}, owner=${owner}, seller=${seller}, buyPrices=${buyPrices[i]}, endPrice=${endPrices[i]}, endTime=${moment.unix(endTimes[i]).utc().format()}`);
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

		case 'LogTokenUnsold': {
			const token         = parameters[0].value;
			const tokenId       = new BigNumber(parameters[1].value);
			console.log(`Token Unsold: token=${token}, tokenId=0x${tokenId.toString(16)}`);
			break;
		}

		case 'LogBidPlaced': {
			const token         = parameters[0].value;
			const tokenId       = new BigNumber(parameters[1].value);
			const bidder         = parameters[2].value;
			const bid         = parameters[3].value;
			const bidTime      = parameters[4].value;
			console.log(`Bid Placed : token=${token}, tokenId=0x${tokenId.toString(16)}, bidder=${bidder}, bid=${bid}, bidPlacedAt=${moment.unix(bidTime).utc().format()}`);
			break;
		}
		default:
			console.log(`Skipping event ${name}...`);
	}
}

module.exports = {
	accounts: accounts,
	BigNumber: BigNumber,
	Bluebird: Bluebird,
	assert: assert,
	should: should,
	OrderStatus: OrderStatus,
	getBalanceAsync: getBalanceAsync,
	getBalanceAsyncStr: getBalanceAsyncStr,
	parseUnixMarketEvent: parseUnixMarketEvent
};
