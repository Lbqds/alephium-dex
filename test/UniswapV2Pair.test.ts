import { Asset, Fields, Number256, Project, Token, web3 } from '@alephium/web3'
import {
  bigintToHex,
  buildProject,
  ContractInfo,
  createUniswapV2Pair,
  oneAlph,
  randomContractAddress,
  randomP2PKHAddress,
  randomTokenId,
  randomTokenPair,
  subContractIdWithGroup
} from './fixtures/UniswapFixture'
import BigNumber from 'bignumber.js'
import { expectAssertionError, randomContractId } from '@alephium/web3-test'

const MinimumLiquidity = 1000n

describe('test uniswap v2 pair', () => {
  web3.setCurrentNodeProvider('http://127.0.0.1:22973')

  function expectTokensEqual(expected: Token[], have: Token[]) {
    expect(expected.length).toEqual(have.length)
    expected.forEach((t) => expect(have.some((v) => v.amount === t.amount && v.id === t.id)).toEqual(true))
  }

  function calcLiquidity(
    amount0: bigint,
    amount1: bigint,
    reserve0: bigint,
    reserve1: bigint,
    totalSupply: bigint
  ): bigint {
    const liquidity0 = (amount0 * totalSupply) / reserve0
    const liquidity1 = (amount1 * totalSupply) / reserve1
    return liquidity0 < liquidity1 ? liquidity0 : liquidity1
  }

  function calcCumulativePrice(
    price0: bigint,
    price1: bigint,
    reserve0: bigint,
    reserve1: bigint,
    timeElapsed: bigint
  ): [bigint, bigint] {
    const factor = 1n << 112n
    const newPrice0 = ((reserve1 * factor) / reserve0) * timeElapsed + price0
    const newPrice1 = ((reserve0 * factor) / reserve1) * timeElapsed + price1
    return [newPrice0, newPrice1]
  }

  async function mint(
    contractInfo: ContractInfo,
    sender: string,
    amount0: bigint,
    amount1: bigint,
    initialFields?: Fields,
    initialAsset?: Asset
  ) {
    const token0Id = contractInfo.selfState.fields['token0Id'] as string
    const token1Id = contractInfo.selfState.fields['token1Id'] as string
    const initFields = initialFields ?? contractInfo.selfState.fields
    const initAsset = initialAsset ?? contractInfo.selfState.asset
    const inputAssets = [
      {
        address: sender,
        asset: {
          alphAmount: oneAlph,
          tokens: [
            { id: token0Id, amount: amount0 },
            { id: token1Id, amount: amount1 }
          ]
        }
      }
    ]
    const mintResult = await contractInfo.contract.testPublicMethod('mint', {
      initialFields: initFields,
      initialAsset: initAsset,
      address: contractInfo.address,
      existingContracts: contractInfo.dependencies,
      testArgs: {
        sender: sender,
        amount0: amount0,
        amount1: amount1
      },
      inputAssets: inputAssets
    })
    const contractState = mintResult.contracts.find((c) => c.contractId === contractInfo.contractId)!
    const reserve0 = contractState.fields['reserve0'] as Number256
    const reserve1 = contractState.fields['reserve1'] as Number256
    const totalSupply = contractState.fields['totalSupply'] as Number256
    return {
      mintResult,
      contractState,
      reserve0,
      reserve1,
      totalSupply
    }
  }

  test('mint', async () => {
    await buildProject()

    const [token0Id, token1Id] = randomTokenPair()
    const contractInfo = createUniswapV2Pair(token0Id, token1Id)
    const sender = randomP2PKHAddress()

    async function testMint(amount0: bigint, amount1: bigint, initialFields?: Fields, initialAsset?: Asset) {
      const initFields = initialFields ?? contractInfo.selfState.fields
      const {
        mintResult: testResult,
        contractState,
        reserve0: currentReserve0,
        reserve1: currentReserve1,
        totalSupply: currentTotalSupply
      } = await mint(contractInfo, sender, amount0, amount1, initialFields, initialAsset)

      const previousReserve0 = initFields['reserve0'] as Number256
      const previousReserve1 = initFields['reserve1'] as Number256
      expect(contractState.fields['reserve0']).toEqual(currentReserve0)
      expect(contractState.fields['reserve1']).toEqual(currentReserve1)

      if (previousReserve0 === 0n && previousReserve1 === 0n) {
        expect(contractState.fields['price0CumulativeLast']).toEqual(0n)
        expect(contractState.fields['price1CumulativeLast']).toEqual(0n)
      } else {
        const previousBlockTimeStamp = initFields['blockTimeStampLast'] as Number256
        const currentBlockTimeStamp = contractState.fields['blockTimeStampLast'] as Number256
        const timeElapsed = currentBlockTimeStamp - previousBlockTimeStamp
        const previousPrice0 = initFields['price0CumulativeLast'] as Number256
        const previousPrice1 = initFields['price1CumulativeLast'] as Number256
        const [currentPrice0, currentPrice1] = calcCumulativePrice(
          previousPrice0,
          previousPrice1,
          previousReserve0,
          previousReserve1,
          timeElapsed
        )
        expect(contractState.fields['price0CumulativeLast']).toEqual(currentPrice0)
        expect(contractState.fields['price1CumulativeLast']).toEqual(currentPrice1)
      }

      const previousTotalSupply = initFields['totalSupply'] as Number256
      const liquidity =
        previousTotalSupply === 0n
          ? BigInt(
              BigNumber((amount0 * amount1).toString())
                .sqrt()
                .toFixed(0, BigNumber.ROUND_DOWN)
            ) - MinimumLiquidity
          : calcLiquidity(amount0, amount1, previousReserve0, previousReserve1, previousTotalSupply)
      expect(contractState.fields['totalSupply']).toEqual(currentTotalSupply)

      expectTokensEqual(contractState.asset.tokens!, [
        { id: token0Id, amount: currentReserve0 },
        { id: token1Id, amount: currentReserve1 },
        { id: contractInfo.contractId, amount: (1n << 255n) - currentTotalSupply }
      ])

      const liquidityAssetOutput = testResult.txOutputs.find((o) => o.address === sender)!
      expect(liquidityAssetOutput.tokens!).toEqual([
        {
          id: contractInfo.contractId,
          amount: liquidity
        }
      ])
      expect(testResult.events.length).toEqual(1)
      expect(testResult.events[0].fields).toEqual({
        sender: sender,
        amount0: amount0,
        amount1: amount1,
        liquidity: liquidity
      })
      return contractState
    }

    await expectAssertionError(testMint(100n, 5000n), contractInfo.address, 1)
    const contractState0 = await testMint(1000n, 30000n)
    const contractState1 = await testMint(1000n, 30000n, contractState0.fields, contractState0.asset)
    const contractState2 = await testMint(1000n, 20000n, contractState1.fields, contractState1.asset)
    const contractState3 = await testMint(30000n, 1000n, contractState2.fields, contractState2.asset)
    await testMint(1000n, 30000n, contractState3.fields, contractState3.asset)
  }, 10000)

  test('burn', async () => {
    await buildProject()

    const [token0Id, token1Id] = randomTokenPair()
    const contractInfo = createUniswapV2Pair(token0Id, token1Id)
    const sender = randomP2PKHAddress()

    async function testBurn(liquidity: bigint, initialFields?: Fields, initialAsset?: Asset) {
      const initFields = initialFields ?? contractInfo.selfState.fields
      const initAsset = initialAsset ?? contractInfo.selfState.asset
      const inputAssets = [
        {
          address: sender,
          asset: {
            alphAmount: oneAlph,
            tokens: [{ id: contractInfo.contractId, amount: liquidity }]
          }
        }
      ]
      return contractInfo.contract.testPublicMethod('burn', {
        initialFields: initFields,
        initialAsset: initAsset,
        address: contractInfo.address,
        existingContracts: contractInfo.dependencies,
        testArgs: {
          sender: sender,
          liquidity: liquidity
        },
        inputAssets: inputAssets
      })
    }

    const { contractState: contractState0, totalSupply } = await mint(contractInfo, sender, 1000n, 4000n)
    await expectAssertionError(testBurn(1n, contractState0.fields, contractState0.asset), contractInfo.address, 3)

    const remainTokens = (1n << 255n) - totalSupply
    const liquidity = 500n
    const burnResult = await testBurn(liquidity, contractState0.fields, contractState0.asset)
    const contractState1 = burnResult.contracts.find((c) => c.contractId === contractInfo.contractId)!
    expect(contractState1.fields['reserve0']).toEqual(750n)
    expect(contractState1.fields['reserve1']).toEqual(3000n)
    expect(contractState1.fields['totalSupply']).toEqual(1500n)
    expectTokensEqual(contractState1.asset.tokens!, [
      { id: contractInfo.contractId, amount: remainTokens + liquidity },
      { id: token0Id, amount: 750n },
      { id: token1Id, amount: 3000n }
    ])
    const assetOutput = burnResult.txOutputs.find((o) => o.address === sender)!
    expectTokensEqual(assetOutput.tokens!, [
      { id: token0Id, amount: 250n },
      { id: token1Id, amount: 1000n }
    ])
    expect(burnResult.events.length).toEqual(1)
    expect(burnResult.events[0].fields).toEqual({
      sender: sender,
      amount0: 250n,
      amount1: 1000n,
      liquidity: liquidity
    })
  })

  test('swap', async () => {
    await buildProject()

    const [token0Id, token1Id] = randomTokenPair()
    const contractInfo = createUniswapV2Pair(token0Id, token1Id)
    const sender = randomP2PKHAddress()

    function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
      //  fee = 0.003 * amountIn
      // ((amountIn - fee) + reserveIn) * (reserveOut - amountOut) >= reserveIn * reserveOut =>
      // amountOut <= (amountIn - fee) * reserveOut / (amountIn - fee + reserveIn)
      // amountOut <= (997 * amountIn * reserveOut) / (997 * amountIn + 1000 * reserveIn)
      const amountInExcludeFee = 997n * amountIn
      const denominator = amountInExcludeFee + reserveIn * 1000n
      const numerator = amountInExcludeFee * reserveOut
      return numerator / denominator
    }

    const { contractState, reserve0, reserve1, totalSupply } = await mint(contractInfo, sender, 100n, 80000n)
    async function testSwap(tokenInId: string, amountIn: bigint, amountOut: bigint) {
      const inputAssets = [
        {
          address: sender,
          asset: {
            alphAmount: oneAlph,
            tokens: [{ id: tokenInId, amount: amountIn }]
          }
        }
      ]
      const testResult = await contractInfo.contract.testPublicMethod('swap', {
        initialFields: contractState.fields,
        initialAsset: contractState.asset,
        address: contractInfo.address,
        existingContracts: contractInfo.dependencies,
        testArgs: {
          sender: sender,
          tokenInId: tokenInId,
          amountIn: amountIn,
          amountOut: amountOut
        },
        inputAssets: inputAssets
      })
      const newState = testResult.contracts.find((c) => c.contractId === contractInfo.contractId)!
      const newReserve0 = tokenInId === token0Id ? reserve0 + amountIn : reserve0 - amountOut
      const newReserve1 = tokenInId === token1Id ? reserve1 + amountIn : reserve1 - amountOut
      expect(newState.fields['reserve0']).toEqual(newReserve0)
      expect(newState.fields['reserve1']).toEqual(newReserve1)
      expect(newState.fields['totalSupply']).toEqual(totalSupply)
      expectTokensEqual(newState.asset.tokens!, [
        { id: contractInfo.contractId, amount: (1n << 255n) - totalSupply },
        { id: token0Id, amount: newReserve0 },
        { id: token1Id, amount: newReserve1 }
      ])

      const tokenOutId = tokenInId === token0Id ? token1Id : token0Id
      const assetOutput = testResult.txOutputs.find((o) => o.address === sender)!
      expectTokensEqual(assetOutput.tokens!, [{ id: tokenOutId, amount: amountOut }])
      expect(testResult.events.length).toEqual(1)
      expect(testResult.events[0].fields).toEqual({
        sender: sender,
        tokenInId: tokenInId,
        amountIn: amountIn,
        amountOut: amountOut
      })
    }

    await expectAssertionError(testSwap(token0Id, reserve0, reserve1), contractInfo.address, 5)
    await expectAssertionError(testSwap(token1Id, reserve1, reserve0), contractInfo.address, 5)
    await expectAssertionError(testSwap(token0Id, 10n, 0n), contractInfo.address, 9)
    await expectAssertionError(testSwap(randomTokenId(), 10n, 10n), contractInfo.address, 6)

    const amountIn0 = 20n // token0Id
    const expectedAmountOut0 = getAmountOut(amountIn0, reserve0, reserve1)
    await testSwap(token0Id, amountIn0, expectedAmountOut0)
    await expectAssertionError(testSwap(token0Id, amountIn0, expectedAmountOut0 + 1n), contractInfo.address, 8)

    const amountIn1 = 60000n // token1Id
    const expectedAmountOut1 = getAmountOut(amountIn1, reserve1, reserve0)
    await testSwap(token1Id, amountIn1, expectedAmountOut1)
    await expectAssertionError(testSwap(token1Id, amountIn1, expectedAmountOut1 + 1n), contractInfo.address, 8)
  }, 20000)

  test('flashSwap', async () => {
    await buildProject()

    const [token0Id, token1Id] = randomTokenPair()
    const factoryId = randomContractId()
    const pairContractId = subContractIdWithGroup(factoryId, token0Id + token1Id, 0)
    const contractInfo = createUniswapV2Pair(token0Id, token1Id, pairContractId)
    const sender = randomP2PKHAddress()

    function createFlashSwapTest(factoryId: string, tokens: Token[]): ContractInfo {
      const contract = Project.contract('FlashSwapTest')
      const address = randomContractAddress()
      const contractState = contract.toState(
        { factory: factoryId, callTimes: 0n },
        { alphAmount: oneAlph, tokens: tokens },
        address
      )
      return new ContractInfo(contract, contractState, [], address)
    }

    function getAmountIn(amountOut: bigint): bigint {
      // ((reserveOut - amountOut) + amountIn - amountIn * 0.003) * reserveIn >= reserveOut * reserveIn
      // amountIn >= 1000 * amountOut / 997
      const str = BigNumber((1000n * amountOut).toString())
        .div(BigNumber(997))
        .toFixed(0, BigNumber.ROUND_UP)
      return BigInt(str)
    }

    const { contractState, reserve0, reserve1, totalSupply } = await mint(contractInfo, sender, 100n, 80000n)
    async function testFlashSwap(
      amount0Out: bigint,
      amount0In: bigint,
      amount1Out: bigint,
      amount1In: bigint,
      token0Amount: bigint,
      token1Amount: bigint
    ) {
      const tokens = [
        { id: token0Id, amount: token0Amount },
        { id: token1Id, amount: token1Amount }
      ]
      const flashSwapTestContractInfo = createFlashSwapTest(factoryId, tokens)

      const data = token0Id + bigintToHex(amount0In) + token1Id + bigintToHex(amount1In)
      const testResult = await contractInfo.contract.testPublicMethod('flashSwap', {
        initialFields: contractState.fields,
        initialAsset: contractState.asset,
        address: contractInfo.address,
        existingContracts: contractInfo.dependencies.concat(flashSwapTestContractInfo.states()),
        testArgs: {
          contractId: flashSwapTestContractInfo.contractId,
          amount0Out: amount0Out,
          amount1Out: amount1Out,
          data: data
        }
      })
      const pairContractState = testResult.contracts.find((c) => c.contractId === contractInfo.contractId)!
      expect(pairContractState.fields['reserve0']).toEqual(reserve0 + amount0In - amount0Out)
      expect(pairContractState.fields['reserve1']).toEqual(reserve1 + amount1In - amount1Out)
      expect(pairContractState.fields['totalSupply']).toEqual(totalSupply)
      expectTokensEqual(pairContractState.asset.tokens!, [
        { id: pairContractId, amount: (1n << 255n) - totalSupply },
        { id: token0Id, amount: reserve0 + amount0In - amount0Out },
        { id: token1Id, amount: reserve1 + amount1In - amount1Out }
      ])
      expect(testResult.events.length).toEqual(1)
      expect(testResult.events[0].fields).toEqual({
        contractId: flashSwapTestContractInfo.contractId,
        amount0In: amount0In,
        amount1In: amount1In,
        amount0Out: amount0Out,
        amount1Out: amount1Out
      })

      const flashSwapTestContractState = testResult.contracts.find(
        (c) => c.contractId === flashSwapTestContractInfo.contractId
      )!
      const flashSwapTestContractTokens: Token[] = []
      const token0Remain = token0Amount + amount0Out - amount0In
      if (token0Remain > 0) {
        flashSwapTestContractTokens.push({ id: token0Id, amount: token0Remain })
      }
      const token1Remain = token1Amount + amount1Out - amount1In
      if (token1Remain > 0) {
        flashSwapTestContractTokens.push({ id: token1Id, amount: token1Remain })
      }
      if (flashSwapTestContractState.asset.tokens === undefined) {
        expect(flashSwapTestContractTokens).toEqual([])
      } else {
        expectTokensEqual(flashSwapTestContractState.asset.tokens, flashSwapTestContractTokens)
      }
    }

    const amountOut0 = 20n // token0Id
    const amountIn0 = getAmountIn(amountOut0)
    await testFlashSwap(amountOut0, amountIn0, 0n, 0n, amountIn0 - amountOut0, 0n)
    await expectAssertionError(
      testFlashSwap(amountOut0, amountIn0 - 1n, 0n, 0n, amountIn0 - amountOut0, 0n),
      contractInfo.address,
      8
    )
    await testFlashSwap(amountOut0, amountIn0 + 1n, 0n, 0n, amountIn0 - amountOut0 + 1n, 0n)
    await testFlashSwap(amountOut0, amountIn0, 0n, 0n, amountIn0 - amountOut0 + 1n, 0n)

    const amountOut1 = 30000n // token1Id
    const amountIn1 = getAmountIn(amountOut1)
    await testFlashSwap(0n, 0n, amountOut1, amountIn1, 0n, amountIn1 - amountOut1)
    await expectAssertionError(
      testFlashSwap(0n, 0n, amountOut1, amountIn1 - 1n, 0n, amountIn1 - amountOut1),
      contractInfo.address,
      8
    )
    await testFlashSwap(0n, 0n, amountOut1, amountIn1 + 1n, 0n, amountIn1 - amountOut1 + 1n)
    await testFlashSwap(0n, 0n, amountOut1, amountIn1, 0n, amountIn1 - amountOut1 + 1n)

    await testFlashSwap(20n, 21n, 30000n, 31000n, 1n, 1000n)
  }, 20000)
})
