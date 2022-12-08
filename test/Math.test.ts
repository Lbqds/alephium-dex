import { Number256, web3 } from '@alephium/web3'
import { buildProject, createMath, randomBigInt } from './fixtures/DexFixture'
import BigNumber from 'bignumber.js'

describe('test math', () => {
  web3.setCurrentNodeProvider('http://127.0.0.1:22973')

  test('addWithOverflow', async () => {
    await buildProject()
    const contract = createMath().contract
    const u256Max = (1n << 256n) - 1n

    for (let i = 0; i < 10; i++) {
      const a = randomBigInt(0n, u256Max)
      const b = randomBigInt(0n, u256Max)
      const sum = a + b <= u256Max ? a + b : a + b - (1n << 256n)

      const testResult0 = await contract.testPublicMethod('addWithOverflow', {
        testArgs: {
          a: a,
          b: b
        }
      })
      expect(testResult0.returns.length).toEqual(1)
      expect(testResult0.returns[0] as Number256).toEqual(sum)

      const testResult1 = await contract.testPublicMethod('addWithOverflow', {
        testArgs: {
          a: b,
          b: a
        }
      })
      expect(testResult1.returns.length).toEqual(1)
      expect(testResult1.returns[0] as Number256).toEqual(sum)
    }
  }, 20000)

  test('uqdiv', async () => {
    await buildProject()
    const contract = createMath().contract
    const u112Max = (1n << 112n) - 1n

    for (let i = 0; i < 10; i++) {
      const a = randomBigInt(1n, u112Max)
      const b = randomBigInt(1n, u112Max)
      const result = (a * (1n << 112n)) / b

      const testResult = await contract.testPublicMethod('uqdiv', {
        testArgs: {
          a: a,
          b: b
        }
      })
      expect(testResult.returns.length).toEqual(1)
      expect(testResult.returns[0] as Number256).toEqual(result)
    }
  }, 10000)

  test('sqrt', async () => {
    await buildProject()
    const contract = createMath().contract
    const u256Max = (1n << 256n) - 1n

    for (let i = 0; i < 10; i++) {
      const v = randomBigInt(1n, u256Max)
      const testResult0 = await contract.testPublicMethod('sqrt', {
        testArgs: {
          y: v
        }
      })
      const result = BigNumber(v.toString()).sqrt().toFixed(0, BigNumber.ROUND_DOWN)
      expect(testResult0.returns.length).toEqual(1)
      expect(testResult0.returns[0] as Number256).toEqual(BigInt(result))
    }
  }, 10000)
})
