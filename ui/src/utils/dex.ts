import { addressFromContractId, Contract, Script, Number256, subContractId, SignerProvider, SignExecuteScriptTxResult, NodeProvider, node, web3 } from "@alephium/web3"
import { default as tokenPairContractJson } from "../artifacts/dex/token_pair.ral.json"
import { default as swapScriptJson } from "../artifacts/scripts/swap.ral.json"
import { network } from "./consts"

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

export async function swap(
  signer: SignerProvider,
  sender: string,
  pairId: string,
  tokenInId: string,
  amountIn: bigint,
  amountOut: bigint
): Promise<SignExecuteScriptTxResult> {
  const script = Script.fromJson(swapScriptJson)
  const result = await script.execute(signer, {
    initialFields: {
      sender: sender,
      pair: pairId,
      tokenInId: tokenInId,
      amountIn: amountIn,
      amountOut: amountOut
    },
    tokens: [{ id: tokenInId, amount: amountIn }]
  })
  await waitTxConfirmed(web3.getCurrentNodeProvider(), result.txId, 1)
  return result
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
