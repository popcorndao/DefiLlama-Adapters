const { sumTokens2 } = require("../helper/unwrapLPs")
const { getFixBalances } = require("../helper/portedTokens")
const { getUserMasterChefBalances } = require("../helper/masterchef")
const { getUserCraftsmanV2Balances } = require("./helpers")
const vvsPoolInfoABI = require('./cronos/vvsPoolInfo.json')
const { fetchURL } = require("../helper/utils")

const EMPTY_ADDR = '0x0000000000000000000000000000000000000000'

const BASE_API_URL = 'https://api.singlefinance.io'

const constants = {
  'cronos': {
    chainId: 25,
    single: '0x0804702a4e749d39a35fde73d1df0b1f1d6b8347'
  },
  'fantom': {
    chainId: 250,
    single: '0x8cc97b50fe87f31770bcdcd6bc8603bc1558380b'
  }
}

const lpTokenABI = {
  "inputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "name": "lpToken",
  "outputs": [
    {
      "internalType": "contract IERC20",
      "name": "",
      "type": "address"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}

const spookyMasterchef = '0x18b4f774fdC7BF685daeeF66c2990b1dDd9ea6aD'.toLowerCase()

const getHelpers = (chain) => {

  const SINGLE_TOKEN = constants[chain].single;

  const fetchDataOnce = (() => {

    let data;
    let queues = [];

    return () => new Promise(res => {

      if (data) {
        res(data);
      }

      queues.push(res);

      if (queues.length === 1) {
        fetchURL(`${BASE_API_URL}/api/protocol/contracts?chainid=${constants[chain].chainId}`)
          .then(value => {
            data = value;

            for (const resolve of queues) {
              resolve(value);
            }
          });
      }

    })
  })();

  async function staking(timestamp, _block, chainBlocks) {

    const { data: { pools, vaults, } } = await fetchDataOnce()

    let balances = {}
    const fixBalances = await getFixBalances(chain)
    const block = chainBlocks[chain]
    const tokensAndOwners = pools.filter(pool => !pool.isLP).map(pool => [pool.tokenContract, pool.address])

    await sumTokens2({ balances, tokensAndOwners, block, chain })
    fixBalances(balances)
    return balances
  }

  async function tvl(tx, _block, chainBlocks) {

    const { data: { vaults, wmasterchefs } } = await fetchDataOnce()

    const balances = {}
    const block = chainBlocks[chain]
    const fixBalances = await getFixBalances(chain)

    for (const { masterChef: masterChefAddress, wMasterChef, name, ...rest } of wmasterchefs) {
      if (name === "vvsMultiYield") {
        await getUserCraftsmanV2Balances({ balances, masterChefAddress, userAddres: wMasterChef, block, chain, poolInfoABI: vvsPoolInfoABI, excludePool2: true, pool2Tokens: [SINGLE_TOKEN], craftsmanV1: rest.craftsmanV1 })
        continue;
      }
      if (masterChefAddress.toLowerCase() === spookyMasterchef) {
        await getUserMasterChefBalances({ balances, masterChefAddress, userAddres: wMasterChef, block, chain, poolInfoABI: lpTokenABI, excludePool2: true, pool2Tokens: [SINGLE_TOKEN], getLPAddress:  a => a })
        continue;
      }
      await getUserMasterChefBalances({ balances, masterChefAddress, userAddres: wMasterChef, block, chain, poolInfoABI: vvsPoolInfoABI, excludePool2: true, pool2Tokens: [SINGLE_TOKEN] })
    }

    const tokensAndOwners = vaults.map(({ token, address }) => [token, address])
    await sumTokens2({ balances, tokensAndOwners, block, chain }) // Add lending pool tokens to balances
    fixBalances(balances)
    return balances
  }

  async function pool2(tx, _block, chainBlocks) {

    const { data: { wmasterchefs, pools } } = await fetchDataOnce()

    const balances = {}
    const block = chainBlocks[chain]
    const fixBalances = await getFixBalances(chain)
    const tokensAndOwners = pools.filter(pool => pool.isLP).map(pool => [pool.tokenContract, pool.address])
    await sumTokens2({ balances, tokensAndOwners, block, chain, resolveLP: true }) // Add staked lp tokens to balances

    for (const { masterChef: masterChefAddress, wMasterChef, name, ...rest } of wmasterchefs) {
      if (name === "vvsMultiYield") {
        await getUserCraftsmanV2Balances({ balances, masterChefAddress, userAddres: wMasterChef, block, chain, poolInfoABI: vvsPoolInfoABI, onlyPool2: true, pool2Tokens: [SINGLE_TOKEN], craftsmanV1: rest.craftsmanV1 })
        continue;
      }
      if (masterChefAddress.toLowerCase() === spookyMasterchef) {
        await getUserMasterChefBalances({ balances, masterChefAddress, userAddres: wMasterChef, block, chain, poolInfoABI: lpTokenABI, onlyPool2: true, pool2Tokens: [SINGLE_TOKEN], getLPAddress:  a => a })
        continue;
      }
      await getUserMasterChefBalances({ balances, masterChefAddress, userAddres: wMasterChef, block, chain, poolInfoABI: vvsPoolInfoABI, onlyPool2: true, pool2Tokens: [SINGLE_TOKEN] })
    }

    fixBalances(balances)
    return balances
  }

  return {
    tvl,
    pool2,
    staking
  }
}

module.exports = {
  start: 1643186078,
  // if we can backfill data with your adapter. Most SDK adapters will allow this, but not all. For example, if you fetch a list of live contracts from an API before querying data on-chain, timetravel should be 'false'.
  timetravel: true,
  //if you have used token substitutions at any point in the adapter this should be 'true'.
  misrepresentedTokens: true,
  cronos: getHelpers('cronos'),
  fantom: getHelpers('fantom'),
} // see if single will run with updated unwrapLPs


