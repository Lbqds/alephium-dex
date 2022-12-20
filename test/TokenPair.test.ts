import { Asset, Fields, Number256, Token, web3 } from '@alephium/web3'
import {
  alphTokenId,
  buildProject,
  ContractInfo,
  createTokenPair,
  defaultGasFee,
  ErrorCodes,
  oneAlph,
  randomP2PKHAddress,
  randomTokenId,
  randomTokenPair
} from './fixtures/DexFixture'
import BigNumber from 'bignumber.js'
import { expectAssertionError } from '@alephium/web3-test'

const MinimumLiquidity = 1000n

describe('test token pair', () => {
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

  function getInputAmount(
    reserve0: bigint,
    reserve1: bigint,
    amount0Desired: bigint,
    amount1Desired: bigint,
    amount0Min: bigint,
    amount1Min: bigint
  ): [bigint, bigint] {
    if (reserve0 === 0n && reserve1 === 0n) {
      return [amount0Desired, amount1Desired]
    }

    const amount1Optimal = (amount0Desired * reserve1) / reserve0
    if (amount1Optimal <= amount1Desired) {
      if (amount1Optimal < amount1Min) throw new Error('Invalid amount1')
      return [amount0Desired, amount1Optimal]
    }

    const amount0Optimal = (amount1Desired * reserve0) / reserve1
    if (amount0Optimal > amount0Desired || amount0Optimal < amount0Min) {
      throw new Error('Invalid amount0')
    }
    return [amount0Optimal, amount1Desired]
  }

  async function addLiquidity(
    contractInfo: ContractInfo,
    sender: string,
    amount0Desired: bigint,
    amount1Desired: bigint,
    amount0Min: bigint,
    amount1Min: bigint,
    deadline: bigint,
    initialFields?: Fields,
    initialAsset?: Asset
  ) {
    const token0Id = contractInfo.selfState.fields['token0Id'] as string
    const token1Id = contractInfo.selfState.fields['token1Id'] as string
    const initFields = initialFields ?? contractInfo.selfState.fields
    const initAsset = initialAsset ?? contractInfo.selfState.asset

    const tokens: Token[] = [{ id: token1Id, amount: amount1Desired }]
    let alphAmount: bigint = oneAlph
    if (token0Id === alphTokenId) {
      alphAmount += amount0Desired
    } else {
      tokens.push({ id: token0Id, amount: amount0Desired })
    }

    const inputAssets = [
      {
        address: sender,
        asset: { alphAmount: alphAmount, tokens: tokens }
      }
    ]
    const testResult = await contractInfo.contract.testPublicMethod('addLiquidity', {
      initialFields: initFields,
      initialAsset: initAsset,
      address: contractInfo.address,
      existingContracts: contractInfo.dependencies,
      testArgs: {
        sender: sender,
        amount0Desired: amount0Desired,
        amount1Desired: amount1Desired,
        amount0Min: amount0Min,
        amount1Min: amount1Min,
        deadline: deadline
      },
      inputAssets: inputAssets
    })
    const contractState = testResult.contracts.find((c) => c.contractId === contractInfo.contractId)!
    const reserve0 = contractState.fields['reserve0'] as Number256
    const reserve1 = contractState.fields['reserve1'] as Number256
    const totalSupply = contractState.fields['totalSupply'] as Number256
    return {
      testResult: testResult,
      contractState,
      reserve0,
      reserve1,
      totalSupply
    }
  }

  test('getInputAmount', async () => {
    await buildProject()

    const [token0Id, token1Id] = randomTokenPair()
    const contractInfo = createTokenPair(token0Id, token1Id)

    async function test(
      reserve0: bigint,
      reserve1: bigint,
      amount0Desired: bigint,
      amount1Desired: bigint,
      amount0Min: bigint,
      amount1Min: bigint
    ): Promise<[bigint, bigint]> {
      const initialFields = {
        ...contractInfo.selfState.fields,
        reserve0: reserve0,
        reserve1: reserve1
      }
      const result = await contractInfo.contract.testPrivateMethod('getInputAmount', {
        initialFields: initialFields,
        address: contractInfo.address,
        existingContracts: contractInfo.dependencies,
        testArgs: {
          amount0Desired: amount0Desired,
          amount1Desired: amount1Desired,
          amount0Min: amount0Min,
          amount1Min: amount1Min
        }
      })
      expect(result.returns.length).toEqual(2)
      return [result.returns[0] as Number256, result.returns[1] as Number256]
    }

    expect(await test(0n, 0n, 100n, 200n, 80n, 160n)).toEqual([100n, 200n])
    expect(await test(1000n, 3000n, 1000n, 3000n, 1000n, 3000n)).toEqual([1000n, 3000n])
    await expectAssertionError(
      test(1000n, 3000n, 500n, 3000n, 500n, 2000n),
      contractInfo.address,
      ErrorCodes.InsufficientToken1Amount
    )
    expect(await test(1000n, 3000n, 500n, 3000n, 500n, 1500n)).toEqual([500n, 1500n])
    expect(await test(1000n, 3000n, 500n, 3000n, 500n, 1000n)).toEqual([500n, 1500n])
    await expectAssertionError(
      test(1000n, 3000n, 1000n, 2000n, 800n, 2000n),
      contractInfo.address,
      ErrorCodes.InsufficientToken0Amount
    )
    expect(await test(1000n, 3000n, 1000n, 2000n, 500n, 2000n)).toEqual([666n, 2000n])
    expect(await test(1000n, 3000n, 1000n, 2000n, 500n, 1000n)).toEqual([666n, 2000n])

    expect(getInputAmount(0n, 0n, 100n, 200n, 80n, 160n)).toEqual([100n, 200n])
    expect(getInputAmount(1000n, 3000n, 1000n, 3000n, 1000n, 3000n)).toEqual([1000n, 3000n])
    expect(() => getInputAmount(1000n, 3000n, 500n, 3000n, 500n, 2000n)).toThrow(Error('Invalid amount1'))
    expect(getInputAmount(1000n, 3000n, 500n, 3000n, 500n, 1500n)).toEqual([500n, 1500n])
    expect(getInputAmount(1000n, 3000n, 500n, 3000n, 500n, 1000n)).toEqual([500n, 1500n])
    expect(() => getInputAmount(1000n, 3000n, 1000n, 2000n, 800n, 2000n)).toThrow(Error('Invalid amount0'))
    expect(getInputAmount(1000n, 3000n, 1000n, 2000n, 500n, 2000n)).toEqual([666n, 2000n])
    expect(getInputAmount(1000n, 3000n, 1000n, 2000n, 500n, 1000n)).toEqual([666n, 2000n])
  }, 20000)

  test('addLiquidity', async () => {
    await buildProject()

    const sender = randomP2PKHAddress()

    async function testAddLiquidity(
      contractInfo: ContractInfo,
      amount0Desired: bigint,
      amount1Desired: bigint,
      amount0Min: bigint,
      amount1Min: bigint,
      deadline: bigint,
      initialFields?: Fields,
      initialAsset?: Asset
    ) {
      const token0Id = contractInfo.selfState.fields['token0Id'] as string
      const token1Id = contractInfo.selfState.fields['token1Id'] as string
      const initFields = initialFields ?? contractInfo.selfState.fields
      const initAsset = initialAsset ?? contractInfo.selfState.asset
      const {
        testResult: testResult,
        contractState,
        reserve0: currentReserve0,
        reserve1: currentReserve1,
        totalSupply: currentTotalSupply
      } = await addLiquidity(
        contractInfo,
        sender,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        deadline,
        initialFields,
        initAsset
      )

      const previousReserve0 = initFields['reserve0'] as Number256
      const previousReserve1 = initFields['reserve1'] as Number256
      const [amount0, amount1] = getInputAmount(
        previousReserve0,
        previousReserve1,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min
      )

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

      if (token0Id === alphTokenId) {
        expect(contractState.asset.alphAmount).toEqual(amount0 + initAsset.alphAmount)
        expectTokensEqual(contractState.asset.tokens!, [
          { id: token1Id, amount: currentReserve1 },
          { id: contractInfo.contractId, amount: (1n << 255n) - currentTotalSupply }
        ])
      } else {
        expect(contractState.asset.alphAmount).toEqual(initAsset.alphAmount)
        expectTokensEqual(contractState.asset.tokens!, [
          { id: token0Id, amount: currentReserve0 },
          { id: token1Id, amount: currentReserve1 },
          { id: contractInfo.contractId, amount: (1n << 255n) - currentTotalSupply }
        ])
      }

      const assetOutput = testResult.txOutputs.find((o) => o.address === sender)!
      let alphAmount = oneAlph - defaultGasFee
      const tokens = [{ id: contractInfo.contractId, amount: liquidity }]
      if (amount0Desired > amount0) {
        if (token0Id === alphTokenId) {
          alphAmount += amount0Desired - amount0
        } else {
          tokens.push({ id: token0Id, amount: amount0Desired - amount0 })
        }
      }
      if (amount1Desired > amount1) {
        tokens.push({ id: token1Id, amount: amount1Desired - amount1 })
      }
      expect(assetOutput.alphAmount).toEqual(alphAmount)
      expectTokensEqual(assetOutput.tokens!, tokens)
      expect(testResult.events.length).toEqual(1)
      expect(testResult.events[0].fields).toEqual({
        sender: sender,
        amount0: amount0,
        amount1: amount1,
        liquidity: liquidity
      })
      return contractState
    }

    async function test(token0Id: string, token1Id: string) {
      const contractInfo = createTokenPair(token0Id, token1Id)
      await expectAssertionError(
        testAddLiquidity(contractInfo, 1000n, 5000n, 1000n, 5000n, BigInt(Date.now())),
        contractInfo.address,
        ErrorCodes.Expired
      )
      const timestamp = BigInt(Date.now() + 60000)
      await expectAssertionError(
        testAddLiquidity(contractInfo, 100n, 5000n, 100n, 5000n, timestamp),
        contractInfo.address,
        ErrorCodes.InsufficientInitLiquidity
      )
      const contractState0 = await testAddLiquidity(contractInfo, 1000n, 30000n, 1000n, 30000n, timestamp)
      const contractState1 = await testAddLiquidity(
        contractInfo,
        1000n,
        30000n,
        1000n,
        30000n,
        timestamp,
        contractState0.fields,
        contractState0.asset
      )
      const contractState2 = await testAddLiquidity(
        contractInfo,
        1000n,
        20000n,
        500n,
        20000n,
        timestamp,
        contractState1.fields,
        contractState1.asset
      )
      await testAddLiquidity(
        contractInfo,
        500n,
        30000n,
        500n,
        10000n,
        timestamp,
        contractState2.fields,
        contractState2.asset
      )
    }

    const [token0Id, token1Id] = randomTokenPair()
    await test(token0Id, token1Id)
    await test(alphTokenId, token1Id)
  }, 20000)

  test('removeLiquidity', async () => {
    await buildProject()

    const sender = randomP2PKHAddress()

    async function testRemoveLiquidity(
      contractInfo: ContractInfo,
      liquidity: bigint,
      amount0Min: bigint,
      amount1Min: bigint,
      deadline: bigint,
      initialFields: Fields,
      initialAsset: Asset
    ) {
      const token0Id = initialFields['token0Id'] as string
      const token1Id = initialFields['token1Id'] as string
      const totalSupply = initialFields['totalSupply'] as Number256
      const reserve0 = initialFields['reserve0'] as Number256
      const reserve1 = initialFields['reserve1'] as Number256

      const inputAssets = [
        {
          address: sender,
          asset: {
            alphAmount: oneAlph,
            tokens: [{ id: contractInfo.contractId, amount: liquidity }]
          }
        }
      ]
      const testResult = await contractInfo.contract.testPublicMethod('removeLiquidity', {
        initialFields: initialFields,
        initialAsset: initialAsset,
        address: contractInfo.address,
        existingContracts: contractInfo.dependencies,
        testArgs: {
          sender: sender,
          liquidity: liquidity,
          amount0Min: amount0Min,
          amount1Min: amount1Min,
          deadline: deadline
        },
        inputAssets: inputAssets
      })

      const remainTokens = (1n << 255n) - totalSupply
      const contractState = testResult.contracts.find((c) => c.contractId === contractInfo.contractId)!
      const amount0Out = (liquidity * reserve0) / totalSupply
      const amount1Out = (liquidity * reserve1) / totalSupply

      expect(contractState.fields['reserve0']).toEqual(reserve0 - amount0Out)
      expect(contractState.fields['reserve1']).toEqual(reserve1 - amount1Out)
      expect(contractState.fields['totalSupply']).toEqual(totalSupply - liquidity)

      if (token0Id === alphTokenId) {
        expect(contractState.asset.alphAmount).toEqual(initialAsset.alphAmount - amount0Out)
        expectTokensEqual(contractState.asset.tokens!, [
          { id: contractInfo.contractId, amount: remainTokens + liquidity },
          { id: token1Id, amount: reserve1 - amount1Out }
        ])
      } else {
        expect(contractState.asset.alphAmount).toEqual(initialAsset.alphAmount)
        expectTokensEqual(contractState.asset.tokens!, [
          { id: contractInfo.contractId, amount: remainTokens + liquidity },
          { id: token0Id, amount: reserve0 - amount0Out },
          { id: token1Id, amount: reserve1 - amount1Out }
        ])
      }
      const assetOutput = testResult.txOutputs.find((o) => o.address === sender)!

      if (token0Id === alphTokenId) {
        expect(assetOutput.alphAmount).toEqual(oneAlph - defaultGasFee + amount0Out)
        expectTokensEqual(assetOutput.tokens!, [{ id: token1Id, amount: amount1Out }])
      } else {
        expect(assetOutput.alphAmount).toEqual(oneAlph - defaultGasFee)
        expectTokensEqual(assetOutput.tokens!, [
          { id: token0Id, amount: amount0Out },
          { id: token1Id, amount: amount1Out }
        ])
      }
      expect(testResult.events.length).toEqual(1)
      expect(testResult.events[0].fields).toEqual({
        sender: sender,
        amount0: amount0Out,
        amount1: amount1Out,
        liquidity: liquidity
      })
    }

    async function test(token0Id: string, token1Id: string) {
      const contractInfo = createTokenPair(token0Id, token1Id)
      const { contractState } = await addLiquidity(
        contractInfo,
        sender,
        1000n,
        4000n,
        0n,
        0n,
        BigInt(Date.now() + 60000)
      )
      const timestamp = BigInt(Date.now() + 60000)
      await expectAssertionError(
        testRemoveLiquidity(contractInfo, 1n, 100n, 100n, timestamp, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.InsufficientLiquidityBurned
      )
      const invalidTs = BigInt(Date.now())
      await expectAssertionError(
        testRemoveLiquidity(contractInfo, 500n, 251n, 1000n, invalidTs, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.Expired
      )
      await expectAssertionError(
        testRemoveLiquidity(contractInfo, 500n, 251n, 1000n, timestamp, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.InsufficientToken0Amount
      )
      await expectAssertionError(
        testRemoveLiquidity(contractInfo, 500n, 250n, 1001n, timestamp, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.InsufficientToken1Amount
      )
      await testRemoveLiquidity(contractInfo, 500n, 250n, 1000n, timestamp, contractState.fields, contractState.asset)
    }

    const [token0Id, token1Id] = randomTokenPair()
    await test(token0Id, token1Id)
    await test(alphTokenId, token1Id)
  }, 20000)

  test('swap', async () => {
    await buildProject()

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

    async function testSwap(
      contractInfo: ContractInfo,
      tokenInId: string,
      amountIn: bigint,
      amountOut: bigint,
      initialFields: Fields,
      initialAsset: Asset
    ) {
      const token0Id = initialFields['token0Id'] as string
      const token1Id = initialFields['token1Id'] as string
      const totalSupply = initialFields['totalSupply'] as Number256
      const reserve0 = initialFields['reserve0'] as Number256
      const reserve1 = initialFields['reserve1'] as Number256
      const tokenOutId = token0Id === tokenInId ? token1Id : token0Id

      const alphAmount = tokenInId === alphTokenId ? oneAlph + amountIn : oneAlph
      const inputAssets = [
        {
          address: sender,
          asset: {
            alphAmount: alphAmount,
            tokens: tokenInId === alphTokenId ? [] : [{ id: tokenInId, amount: amountIn }]
          }
        }
      ]
      const testResult = await contractInfo.contract.testPublicMethod('swap', {
        initialFields: initialFields,
        initialAsset: initialAsset,
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

      if (token0Id === alphTokenId) {
        expect(newState.asset.alphAmount).toEqual(oneAlph + newReserve0)
        expectTokensEqual(newState.asset.tokens!, [
          { id: contractInfo.contractId, amount: (1n << 255n) - totalSupply },
          { id: token1Id, amount: newReserve1 }
        ])
      } else {
        expect(newState.asset.alphAmount).toEqual(oneAlph)
        expectTokensEqual(newState.asset.tokens!, [
          { id: contractInfo.contractId, amount: (1n << 255n) - totalSupply },
          { id: token0Id, amount: newReserve0 },
          { id: token1Id, amount: newReserve1 }
        ])
      }

      const assetOutput = testResult.txOutputs.find((o) => o.address === sender)!
      if (tokenOutId === alphTokenId) {
        expect(assetOutput.alphAmount).toEqual(alphAmount - defaultGasFee + amountOut)
        expect(assetOutput.tokens).toEqual([])
      } else if (tokenInId === alphTokenId) {
        expect(assetOutput.alphAmount).toEqual(alphAmount - defaultGasFee - amountIn)
        expectTokensEqual(assetOutput.tokens!, [{ id: tokenOutId, amount: amountOut }])
      } else {
        expect(assetOutput.alphAmount).toEqual(alphAmount - defaultGasFee)
        expectTokensEqual(assetOutput.tokens!, [{ id: tokenOutId, amount: amountOut }])
      }
      expect(testResult.events.length).toEqual(1)
      expect(testResult.events[0].fields).toEqual({
        sender: sender,
        tokenInId: tokenInId,
        amountIn: amountIn,
        amountOut: amountOut
      })
    }

    async function test(token0Id: string, token1Id: string) {
      const contractInfo = createTokenPair(token0Id, token1Id)
      const { contractState, reserve0, reserve1 } = await addLiquidity(
        contractInfo,
        sender,
        100n,
        80000n,
        0n,
        0n,
        BigInt(Date.now() + 60000)
      )
      await expectAssertionError(
        testSwap(contractInfo, token0Id, reserve0, reserve1, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.InsufficientLiquidity
      )
      await expectAssertionError(
        testSwap(contractInfo, token1Id, reserve1, reserve0, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.InsufficientLiquidity
      )
      await expectAssertionError(
        testSwap(contractInfo, token0Id, 10n, 0n, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.InsufficientOutputAmount
      )
      await expectAssertionError(
        testSwap(contractInfo, randomTokenId(), 10n, 10n, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.InvalidTokenInId
      )

      const amountIn0 = 20n // token0Id
      const expectedAmountOut0 = getAmountOut(amountIn0, reserve0, reserve1)
      await testSwap(contractInfo, token0Id, amountIn0, expectedAmountOut0, contractState.fields, contractState.asset)
      await expectAssertionError(
        testSwap(contractInfo, token0Id, amountIn0, expectedAmountOut0 + 1n, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.InvalidK
      )

      const amountIn1 = 60000n // token1Id
      const expectedAmountOut1 = getAmountOut(amountIn1, reserve1, reserve0)
      await testSwap(contractInfo, token1Id, amountIn1, expectedAmountOut1, contractState.fields, contractState.asset)
      await expectAssertionError(
        testSwap(contractInfo, token1Id, amountIn1, expectedAmountOut1 + 1n, contractState.fields, contractState.asset),
        contractInfo.address,
        ErrorCodes.InvalidK
      )
    }

    const [token0Id, token1Id] = randomTokenPair()
    await test(token0Id, token1Id)
    await test(alphTokenId, token1Id)
  }, 40000)
})
