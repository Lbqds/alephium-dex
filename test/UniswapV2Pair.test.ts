import { Asset, Fields, Number256, Token, web3 } from '@alephium/web3'
import {
  buildProject,
  ContractInfo,
  createUniswapV2Pair,
  oneAlph,
  randomP2PKHAddress,
  randomTokenId,
  randomTokenPair
} from './fixtures/UniswapFixture'
import BigNumber from 'bignumber.js'
import { expectAssertionError } from '@alephium/web3-test'

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
})
