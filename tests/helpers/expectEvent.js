const assert = require('chai').assert;
const BigNumber = web3.BigNumber;

import * as _ from 'lodash';


const BNtoBigNumber = (obj) => {
  if (!obj) {
    return undefined;
  }

  if (obj.constructor.name === 'BN') {
    return new BigNumber("0x" + obj.toString(16));
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = BNtoBigNumber(obj[i]);
    }
    return obj;
  }

  return obj;
};

const parseBNtoBigNumber = (obj) => {
	Object.keys(obj).forEach(function(key) {
		obj[key] = BNtoBigNumber(obj[key]);
	})
};

const inLogs = async (logs, eventName, args) => {
  const event = logs.find(e => e.event === eventName);
  assert.exists(event);

  parseBNtoBigNumber(event.args);
  if (args) {
	  assert.isTrue(_.isEqual(args, event.args));
  }

};

const inLog = async (log, eventName, args) => {
	assert.equal(log.event, eventName);

	parseBNtoBigNumber(log.args);
	assert.isTrue(_.isEqual(args, log.args));
};


const inTransaction = async (tx, eventName) => {
  const { logs } = await tx;
  return inLogs(logs, eventName);
};

module.exports = {
	inLogs,
	inLog,
	inTransaction,
};
