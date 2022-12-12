import { web3 } from '@alephium/web3'
import { expectAssertionError } from '@alephium/web3-test'
import {
  alphTokenId,
  buildProject,
  createTokenPairFactory,
  oneAlph,
  randomP2PKHAddress,
  randomTokenPair,
  sortTokens,
  subContractIdWithGroup
} from './fixtures/DexFixture'

describe('test token pair factory', () => {
  web3.setCurrentNodeProvider('http://127.0.0.1:22973')

  test('create pair', async () => {
    await buildProject()

    const contractInfo = createTokenPairFactory()
    const contract = contractInfo.contract
    const payer = randomP2PKHAddress()

    async function test(tokenAId: string, tokenBId: string) {
      const testResult = await contract.testPublicMethod('createPair', {
        initialFields: contractInfo.selfState.fields,
        address: contractInfo.address,
        existingContracts: contractInfo.dependencies,
        testArgs: {
          payer: payer,
          alphAmount: oneAlph,
          tokenAId: tokenAId,
          tokenBId: tokenBId
        },
        inputAssets: [
          {
            address: payer,
            asset: {
              alphAmount: oneAlph * 2n
            }
          }
        ]
      })

      const [token0Id, token1Id] = sortTokens(tokenAId, tokenBId)
      const pairContractId = subContractIdWithGroup(contractInfo.contractId, token0Id + token1Id, 0)
      const pairContract = testResult.contracts.find((c) => c.contractId === pairContractId)!
      expect(pairContract.fields).toEqual({
        token0Id: token0Id,
        token1Id: token1Id,
        reserve0: 0n,
        reserve1: 0n,
        blockTimeStampLast: 0n,
        price0CumulativeLast: 0n,
        price1CumulativeLast: 0n,
        totalSupply: 0n
      })
      expect(pairContract.asset).toEqual({
        alphAmount: oneAlph,
        tokens: [{ id: pairContractId, amount: 1n << 255n }]
      })
    }

    const [token0Id, token1Id] = randomTokenPair()
    await expectAssertionError(test(token0Id, token0Id), contractInfo.address, 11)

    await test(token0Id, token1Id)
    await test(token1Id, token0Id)
    await test(alphTokenId, token1Id)
    await test(token1Id, alphTokenId)
  })
})
