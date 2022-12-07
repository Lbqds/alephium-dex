import { web3 } from '@alephium/web3'
import {
  buildProject,
  createUniswapV2Factory,
  oneAlph,
  randomP2PKHAddress,
  randomTokenId,
  sortTokens,
  subContractIdWithGroup
} from './fixtures/UniswapFixture'

describe('test uniswap v2 factory', () => {
  web3.setCurrentNodeProvider('http://127.0.0.1:22973')

  test('create pair', async () => {
    await buildProject()

    const contractInfo = createUniswapV2Factory()
    const contract = contractInfo.contract
    const tokenAId = randomTokenId()
    const tokenBId = randomTokenId()
    const payer = randomP2PKHAddress()

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
  })
})
