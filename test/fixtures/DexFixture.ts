import {
  addressFromContractId,
  binToHex,
  Contract,
  contractIdFromAddress,
  ContractState,
  Project,
  subContractId
} from '@alephium/web3'
import { randomBytes } from 'crypto'
import * as base58 from 'bs58'

export const oneAlph = 10n ** 18n
export const minimalAlphInContract = oneAlph
export const maxAlphAmount = 10n ** 18n * 1000000000n
export const gasPrice = 100000000000n
export const maxGasPerTx = 625000n
export const defaultGasFee = gasPrice * maxGasPerTx

export class ContractInfo {
  contract: Contract
  selfState: ContractState
  dependencies: ContractState[]
  address: string
  contractId: string
  bytecode: string
  codeHash: string

  states(): ContractState[] {
    return [this.selfState].concat(this.dependencies)
  }

  constructor(contract: Contract, selfState: ContractState, dependencies: ContractState[], address: string) {
    this.contract = contract
    this.selfState = selfState
    this.dependencies = dependencies
    this.address = address
    this.contractId = selfState.contractId
    this.bytecode = selfState.bytecode
    this.codeHash = selfState.codeHash
  }
}

export async function buildProject(): Promise<void> {
  if (typeof Project.currentProject === 'undefined') {
    await Project.build({ ignoreUnusedConstantsWarnings: true })
  }
}

export function randomBigInt(min: bigint, max: bigint): bigint {
  const diff = max - min
  const length = diff.toString().length
  let multiplier = ''
  while (multiplier.length < length) {
    multiplier += Math.random().toString().split('.')[1]
  }
  multiplier = multiplier.slice(0, length)
  const num = (diff * BigInt(multiplier)) / 10n ** BigInt(length)
  return num + min
}

export function randomContractAddress(): string {
  const prefix = Buffer.from([0x03])
  const bytes = Buffer.concat([prefix, randomBytes(32)])
  return base58.encode(bytes)
}

export function randomP2PKHAddress(): string {
  const prefix = Buffer.from([0x00])
  const bytes = Buffer.concat([prefix, randomBytes(32)])
  return base58.encode(bytes)
}

export function randomTokenId(): string {
  return binToHex(randomBytes(32))
}

export function sortTokens(tokenAId: string, tokenBId: string): [string, string] {
  const left = BigInt('0x' + tokenAId)
  const right = BigInt('0x' + tokenBId)
  return left < right ? [tokenAId, tokenBId] : [tokenBId, tokenAId]
}

export function randomTokenPair(): [string, string] {
  return sortTokens(randomTokenId(), randomTokenId())
}

// TODO: remove this
export function subContractIdWithGroup(parentContractId: string, path: string, groupIndex: number): string {
  const contractId = subContractId(parentContractId, path)
  return contractId.slice(0, -2) + groupIndex.toString(16).padStart(2, '0')
}

export function bigintToHex(num: bigint): string {
  return num.toString(16).padStart(64, '0')
}

export function createMath(): ContractInfo {
  const mathContract = Project.contract('MathTest')
  const address = randomContractAddress()
  const contractState = mathContract.toState({}, { alphAmount: minimalAlphInContract }, address)
  return new ContractInfo(mathContract, contractState, [], address)
}

export function createTokenPair(token0Id: string, token1Id: string, contractId?: string): ContractInfo {
  const contract = Project.contract('TokenPair')
  const address = contractId ? addressFromContractId(contractId) : randomContractAddress()
  const contractState = contract.toState(
    {
      token0Id: token0Id,
      token1Id: token1Id,
      reserve0: 0n,
      reserve1: 0n,
      blockTimeStampLast: 0n,
      price0CumulativeLast: 0n,
      price1CumulativeLast: 0n,
      totalSupply: 0n
    },
    {
      alphAmount: oneAlph,
      tokens: [
        {
          id: binToHex(contractIdFromAddress(address)),
          amount: 1n << 255n
        }
      ]
    },
    address
  )
  return new ContractInfo(contract, contractState, [], address)
}

export function createTokenPairFactory(): ContractInfo {
  const pairTemplate = createTokenPair(randomTokenId(), randomTokenId())

  const contract = Project.contract('TokenPairFactory')
  const address = randomContractAddress()
  const contractState = contract.toState(
    {
      pairTemplateId: pairTemplate.contractId,
      pairSize: 0n
    },
    {
      alphAmount: oneAlph
    },
    address
  )
  return new ContractInfo(contract, contractState, pairTemplate.states(), address)
}

export function createWrappedAlph(alphAmount: bigint = oneAlph, tokenAmount: bigint = maxAlphAmount): ContractInfo {
  const contract = Project.contract('WrappedAlph')
  const address = randomContractAddress()
  const contractId = binToHex(contractIdFromAddress(address))
  const contractState = contract.toState(
    { wrappedAmount: alphAmount - oneAlph },
    {
      alphAmount: alphAmount,
      tokens: [{ id: contractId, amount: tokenAmount }]
    },
    address
  )
  return new ContractInfo(contract, contractState, [], address)
}
