import {
  addressFromContractId,
  Contract,
  Script,
  Number256,
  subContractId,
  SignerProvider,
  SignExecuteScriptTxResult,
  NodeProvider,
  node,
  web3
} from "@alephium/web3"
import { default as tokenPairContractJson } from "../artifacts/dex/token_pair.ral.json"
import { default as swapMinOutScriptJson } from "../artifacts/scripts/swap_min_out.ral.json"
import { default as swapMaxInScriptJson } from "../artifacts/scripts/swap_max_in.ral.json"
import { default as addLiquidityScriptJson } from "../artifacts/scripts/add_liquidity.ral.json"
import { default as removeLiquidityScriptJson } from "../artifacts/scripts/remove_liquidity.ral.json"
import { default as createPairScriptJson } from "../artifacts/scripts/create_pair.ral.json"
import { network } from "./consts"
import BigNumber from "bignumber.js"

const MINIMUM_LIQUIDITY = 1000n
const DEFAULT_TTL = 60 * 60 * 1000 // one hour in millis

export interface TokenPair {
  token0Id: string
  token1Id: string
  token0Address: string
  token1Address: string
  tokenPairId: string
}

// TODO: load from config
export interface TokenInfo {
  tokenId: string
  tokenAddress: string
  name: string
  logo: string
}

export class DexTokens {
  tokenInfos: TokenInfo[]
  tokenPairs: TokenPair[]
  mapping: Map<string, string[]>

  constructor(tokenInfos?: TokenInfo[], tokenPairs?: TokenPair[], mapping?: Map<string, string[]>) {
    this.tokenInfos = tokenInfos ?? []
    this.tokenPairs = tokenPairs ?? []
    this.mapping = mapping ?? new Map<string, string[]>()
  }

  addTokenInfos(tokenInfos: TokenInfo[]): DexTokens {
    const notExists = tokenInfos.filter((a) => !this.tokenInfos.some(b => a.tokenId === b.tokenId))
    const newTokenInfos = this.tokenInfos.concat(notExists)
    return new DexTokens(newTokenInfos, this.tokenPairs, this.mapping)
  }

  addTokenPairs(tokenPairs: TokenPair[]): DexTokens {
    const notExists = tokenPairs.filter((a) => !this.tokenPairs.some(b => a.tokenPairId === b.tokenPairId))
    const newTokenPairs = this.tokenPairs.concat(notExists)
    return new DexTokens(this.tokenInfos, newTokenPairs, this.mapping)
  }

  addMappings(pairs: Array<[string, string[]]>): DexTokens {
    const newMapping = new Map(this.mapping.entries())
    pairs.forEach(([key, values]) => {
      const current = newMapping.get(key)
      if (current === undefined) {
        newMapping.set(key, values)
      } else {
        newMapping.set(key, current.concat(values))
      }
    })
    return new DexTokens(this.tokenInfos, this.tokenPairs, newMapping)
  }

  getAllowedTokenInfos(tokenAddress: string | undefined): TokenInfo[] {
    if (tokenAddress === undefined) return this.tokenInfos
    const allowed = this.mapping.get(tokenAddress)
    if (allowed === undefined) return []
    return this.tokenInfos.filter((tokenInfo) => allowed.includes(tokenInfo.tokenAddress))
  }
}

export function tokenPairContract(): Contract {
  return Contract.fromJson(tokenPairContractJson)
}

export function subContractIdWithGroup(parentContractId: string, path: string, groupIndex: number): string {
  const contractId = subContractId(parentContractId, path)
  return contractId.slice(0, -2) + groupIndex.toString(16).padStart(2, '0')
}

export function sortTokens(tokenAId: string, tokenBId: string): [string, string] {
  const tokenA = BigInt('0x' + tokenAId)
  const tokenB = BigInt('0x' + tokenBId)
  return tokenA < tokenB ? [tokenAId, tokenBId] : [tokenBId, tokenAId]
}

export interface TokenPairState {
  tokenPairId: string
  reserve0: bigint
  reserve1: bigint
  token0Id: string
  token1Id: string
  totalSupply: bigint
}

export async function getTokenPairState(tokenAId: string, tokenBId: string): Promise<TokenPairState> {
  const factoryId = network.factoryId
  const groupIndex = network.groupIndex
  const [token0Id, token1Id] = sortTokens(tokenAId, tokenBId)
  const path = token0Id + token1Id
  const pairContractId = subContractIdWithGroup(factoryId, path, groupIndex)
  const contractAddress = addressFromContractId(pairContractId)
  const state = await tokenPairContract().fetchState(contractAddress, groupIndex)
  return {
    tokenPairId: pairContractId,
    reserve0: state.fields['reserve0'] as Number256,
    reserve1: state.fields['reserve1'] as Number256,
    token0Id: state.fields['token0Id'] as string,
    token1Id: state.fields['token1Id'] as string,
    totalSupply: state.fields['totalSupply'] as Number256
  }
}

export function getAmountIn(
  state: TokenPairState,
  tokenOutId: string,
  amountOut: bigint
): bigint {
  if (tokenOutId === state.token0Id) return _getAmountIn(amountOut, state.reserve1, state.reserve0)
  else return _getAmountIn(amountOut, state.reserve0, state.reserve1)
}

function _getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountOut >= reserveOut) {
    throw new Error(`amountOut must less than reserveOut, amountOut: ${amountOut}, reserveOut: ${reserveOut}`)
  }
  let numerator = reserveIn * amountOut * 1000n
  let denominator = (reserveOut - amountOut) * 997n
  return (numerator / denominator) + 1n
}

export function getAmountOut(
  state: TokenPairState,
  tokenInId: string,
  amountIn: bigint
): bigint {
  if (tokenInId === state.token0Id) return _getAmountOut(amountIn, state.reserve0, state.reserve1)
  else return _getAmountOut(amountIn, state.reserve1, state.reserve0)
}

function _getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  let amountInExcludeFee = 997n * amountIn
  let numerator = amountInExcludeFee * reserveOut
  let denominator = amountInExcludeFee + 1000n * reserveIn
  let result = numerator / denominator
  if (result >= reserveIn) {
    throw new Error(`amountIn must less than reserveIn, amountIn: ${result}, reserveIn: ${reserveIn}`)
  }
  return result
}

async function swapMinOut(
  signer: SignerProvider,
  sender: string,
  pairId: string,
  tokenInId: string,
  amountIn: bigint,
  amountOutMin: bigint
): Promise<SignExecuteScriptTxResult> {
  const script = Script.fromJson(swapMinOutScriptJson)
  const result = await script.execute(signer, {
    initialFields: {
      sender: sender,
      pair: pairId,
      tokenInId: tokenInId,
      amountIn: amountIn,
      amountOutMin: amountOutMin
    },
    tokens: [{ id: tokenInId, amount: amountIn }]
  })
  await waitTxConfirmed(web3.getCurrentNodeProvider(), result.txId, 1)
  return result
}

async function swapMaxIn(
  signer: SignerProvider,
  sender: string,
  pairId: string,
  tokenInId: string,
  amountInMax: bigint,
  amountOut: bigint
): Promise<SignExecuteScriptTxResult> {
  const script = Script.fromJson(swapMaxInScriptJson)
  const result = await script.execute(signer, {
    initialFields: {
      sender: sender,
      pair: pairId,
      tokenInId: tokenInId,
      amountInMax: amountInMax,
      amountOut: amountOut
    },
    tokens: [{ id: tokenInId, amount: amountInMax }]
  })
  await waitTxConfirmed(web3.getCurrentNodeProvider(), result.txId, 1)
  return result
}

export async function swap(
  type: 'ExactInput' | 'ExactOutput',
  signer: SignerProvider,
  sender: string,
  pairId: string,
  tokenInId: string,
  amountIn: bigint,
  amountOut: bigint
): Promise<SignExecuteScriptTxResult> {
  if (type === 'ExactInput') {
    const amountOutMin = (amountOut * 995n) / 1000n
    return swapMinOut(signer, sender, pairId, tokenInId, amountIn, amountOutMin)
  }

  const amountInMax = (amountIn * 1005n) / 1000n
  return swapMaxIn(signer, sender, pairId, tokenInId, amountInMax, amountOut)
}

function isConfirmed(txStatus: node.TxStatus): txStatus is node.Confirmed {
  return txStatus.type === 'Confirmed'
}

export async function waitTxConfirmed(
  provider: NodeProvider,
  txId: string,
  confirmations: number
): Promise<node.Confirmed> {
  const status = await provider.transactions.getTransactionsStatus({ txId: txId })
  if (isConfirmed(status) && status.chainConfirmations >= confirmations) {
    return status
  }
  await new Promise((r) => setTimeout(r, 1000))
  return waitTxConfirmed(provider, txId, confirmations)
}

export interface AddLiquidityResult {
  amountA: bigint
  amountB: bigint
  shareAmount: bigint
  sharePercentage: number
}

export function formatAddLiquidityResult(result: AddLiquidityResult): string {
  return `Share amount: ${result.shareAmount.toString()}, share percentage: ${result.sharePercentage}%`
}

export function getInitAddLiquidityResult(amountA: bigint, amountB: bigint): AddLiquidityResult {
  const liquidity = sqrt(amountA * amountB)
  if (liquidity <= MINIMUM_LIQUIDITY) {
    throw new Error('insufficient initial liquidity')
  }
  return {
    amountA: amountA,
    amountB: amountB,
    shareAmount: liquidity - MINIMUM_LIQUIDITY,
    sharePercentage: 100
  }
}

export function getAddLiquidityResult(state: TokenPairState, tokenId: string, amountA: bigint, type: 'TokenA' | 'TokenB'): AddLiquidityResult {
  const [reserveA, reserveB] = tokenId === state.token0Id
    ? [state.reserve0, state.reserve1]
    : [state.reserve1, state.reserve0]
  const amountB = amountA * reserveB / reserveA
  const liquidityA = amountA * state.totalSupply / reserveA
  const liquidityB = amountB * state.totalSupply / reserveB
  const liquidity = liquidityA < liquidityB ? liquidityA : liquidityB
  const totalSupply = state.totalSupply + liquidity
  const percentage = BigNumber((100n * liquidity).toString())
    .div(BigNumber(totalSupply.toString()))
    .toFixed(5)
  const result = {
    amountA: type === 'TokenA' ? amountA : amountB,
    amountB: type === 'TokenA' ? amountB : amountA,
    shareAmount: liquidity,
    sharePercentage: parseFloat(percentage)
  }
  return result
}

function sqrt(y: bigint): bigint {
  if (y > 3) {
    let z = y
    let x = y / 2n + 1n
    while (x < z) {
      z = x
      x = (y / x + x) / 2n
    }
    return z
  }
  return 1n
}

function calcSlippageAmount(amount: bigint, isInitial: boolean): bigint {
  return isInitial ? amount : (amount * 995n) / 1000n
}

export async function addLiquidity(
  signer: SignerProvider,
  sender: string,
  tokenPairState: TokenPairState,
  tokenAId: string,
  tokenBId: string,
  amountADesired: bigint,
  amountBDesired: bigint
): Promise<SignExecuteScriptTxResult> {
  const isInitial = tokenPairState.reserve0 === 0n && tokenPairState.reserve1 === 0n
  const amountAMin = calcSlippageAmount(amountADesired, isInitial)
  const amountBMin = calcSlippageAmount(amountBDesired, isInitial)
  const deadline = BigInt(Date.now() + DEFAULT_TTL)
  const script = Script.fromJson(addLiquidityScriptJson)
  const [amount0Desired, amount1Desired, amount0Min, amount1Min] = tokenAId === tokenPairState.token0Id
    ? [amountADesired, amountBDesired, amountAMin, amountBMin]
    : [amountBDesired, amountADesired, amountBMin, amountAMin]
  const result = await script.execute(signer, {
    initialFields: {
      sender: sender,
      pair: tokenPairState.tokenPairId,
      amount0Desired: amount0Desired,
      amount1Desired: amount1Desired,
      amount0Min: amount0Min,
      amount1Min: amount1Min,
      deadline: deadline
    },
    tokens: [
      { id: tokenAId, amount: amountADesired },
      { id: tokenBId, amount: amountBDesired }
    ]
  })
  await waitTxConfirmed(web3.getCurrentNodeProvider(), result.txId, 1)
  return result
}

export interface RemoveLiquidityResult {
  token0Id: string
  amount0: bigint
  token1Id: string
  amount1: bigint
  remainShareAmount: bigint
  remainSharePercentage: number
}

export function getRemoveLiquidityResult(
  tokenPairState: TokenPairState & { totalLiquidityAmount: bigint } , liquidity: bigint
): RemoveLiquidityResult {
  if (liquidity > tokenPairState.totalLiquidityAmount) {
    throw new Error(`not enough balance`)
  }
  const amount0 = liquidity * tokenPairState.reserve0 / tokenPairState.totalSupply
  const amount1 = liquidity * tokenPairState.reserve1 / tokenPairState.totalSupply
  const remainShareAmount = tokenPairState.totalLiquidityAmount - liquidity
  const remainSupply = tokenPairState.totalSupply - liquidity
  const remainSharePercentage = BigNumber((100n * remainShareAmount).toString())
    .div(BigNumber(remainSupply.toString()))
    .toFixed(5)
  return {
    token0Id: tokenPairState.token0Id,
    amount0,
    token1Id: tokenPairState.token1Id,
    amount1,
    remainShareAmount,
    remainSharePercentage: parseFloat(remainSharePercentage)
  }
}

export async function removeLiquidity(
  signer: SignerProvider,
  sender: string,
  pairId: string,
  liquidity: bigint,
  amount0Desired: bigint,
  amount1Desired: bigint
): Promise<SignExecuteScriptTxResult> {
  const amount0Min = calcSlippageAmount(amount0Desired, false)
  const amount1Min = calcSlippageAmount(amount1Desired, false)
  const deadline = BigInt(Date.now() + DEFAULT_TTL)
  const script = Script.fromJson(removeLiquidityScriptJson)
  const result = await script.execute(signer, {
    initialFields: {
      sender: sender,
      pairId: pairId,
      liquidity: liquidity,
      amount0Min: amount0Min,
      amount1Min: amount1Min,
      deadline: deadline
    },
    tokens: [{ id: pairId, amount: liquidity }]
  })
  await waitTxConfirmed(web3.getCurrentNodeProvider(), result.txId, 1)
  return result
}

export function formatRemoveLiquidityResult(result: RemoveLiquidityResult): string {
  return `Share amount: ${result.remainShareAmount.toString()}, share percentage: ${result.remainSharePercentage}%`
}

export async function getBalance(tokenId: string, address: string): Promise<bigint> {
  const balances = await web3.getCurrentNodeProvider().addresses.getAddressesAddressBalance(address)
  const balance = balances.tokenBalances?.find((balance) => balance.id === tokenId)
  return balance === undefined ? 0n : BigInt(balance.amount)
}

export async function tokenPairExist(tokenAId: string, tokenBId: string): Promise<boolean> {
  const factoryId = network.factoryId
  const groupIndex = network.groupIndex
  const [token0Id, token1Id] = sortTokens(tokenAId, tokenBId)
  const path = token0Id + token1Id
  const pairContractId = subContractIdWithGroup(factoryId, path, groupIndex)
  const contractAddress = addressFromContractId(pairContractId)
  return web3.getCurrentNodeProvider()
      .addresses
      .getAddressesAddressGroup(contractAddress)
      .then(_ => true)
      .catch((e: any) => {
        if (e instanceof Error && e.message.indexOf("Group not found") !== -1) {
          return false
        }
        throw e
      })
}

export async function createTokenPair(
  signer: SignerProvider,
  sender: string,
  tokenAId: string,
  tokenBId: string
): Promise<SignExecuteScriptTxResult & { tokenPairId: string }> {
  const groupIndex = network.groupIndex
  const [token0Id, token1Id] = sortTokens(tokenAId, tokenBId)
  const path = token0Id + token1Id
  const pairContractId = subContractIdWithGroup(network.factoryId, path, groupIndex)
  const script = Script.fromJson(createPairScriptJson)
  const result = await script.execute(signer, {
    initialFields: {
      payer: sender,
      factory: network.factoryId,
      alphAmount: 10n ** 18n,
      tokenAId: tokenAId,
      tokenBId: tokenBId
    },
    attoAlphAmount: 10n ** 18n,
    tokens: [
      { id: tokenAId, amount: 1n },
      { id: tokenBId, amount: 1n },
    ]
  })
  await waitTxConfirmed(web3.getCurrentNodeProvider(), result.txId, 1)
  return { ...result, tokenPairId: pairContractId }
}
