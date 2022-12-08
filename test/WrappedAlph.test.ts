import { web3 } from '@alephium/web3'
import {
  buildProject,
  createWrappedAlph,
  defaultGasFee,
  maxAlphAmount,
  oneAlph,
  randomBigInt,
  randomP2PKHAddress
} from './fixtures/DexFixture'

describe('test wrapped alph', () => {
  web3.setCurrentNodeProvider('http://127.0.0.1:22973')

  test('deposit', async () => {
    await buildProject()

    const amount = randomBigInt(1n, maxAlphAmount)
    const contractInfo = createWrappedAlph()
    const sender = randomP2PKHAddress()
    const testResult = await contractInfo.contract.testPublicMethod('deposit', {
      initialFields: contractInfo.selfState.fields,
      initialAsset: contractInfo.selfState.asset,
      address: contractInfo.address,
      testArgs: { sender: sender, amount: amount },
      inputAssets: [
        {
          address: sender,
          asset: { alphAmount: amount + oneAlph } // add 1 alph for tx fee
        }
      ]
    })

    const contractState = testResult.contracts.find((c) => c.contractId === contractInfo.contractId)!
    expect(contractState.fields['wrappedAmount']).toEqual(amount)
    expect(contractState.asset).toEqual({
      alphAmount: amount + oneAlph,
      tokens: [{ id: contractInfo.contractId, amount: maxAlphAmount - amount }]
    })

    const assetOutput = testResult.txOutputs.find((o) => o.address === sender)!
    expect(assetOutput.alphAmount).toEqual(oneAlph - defaultGasFee)
    expect(assetOutput.tokens).toEqual([{ id: contractInfo.contractId, amount: amount }])
  })

  test('withdraw', async () => {
    await buildProject()

    const amount = randomBigInt(1n, maxAlphAmount)
    const contractInfo = createWrappedAlph(amount + oneAlph, maxAlphAmount - amount)
    const sender = randomP2PKHAddress()
    const testResult = await contractInfo.contract.testPublicMethod('withdraw', {
      initialFields: contractInfo.selfState.fields,
      initialAsset: contractInfo.selfState.asset,
      address: contractInfo.address,
      testArgs: { sender: sender, amount: amount },
      inputAssets: [
        {
          address: sender,
          asset: {
            alphAmount: oneAlph,
            tokens: [{ id: contractInfo.contractId, amount: amount }]
          }
        }
      ]
    })

    const contractState = testResult.contracts.find((c) => c.contractId === contractInfo.contractId)!
    expect(contractState.fields['wrappedAmount']).toEqual(0n)
    expect(contractState.asset).toEqual({
      alphAmount: oneAlph,
      tokens: [{ id: contractInfo.contractId, amount: maxAlphAmount }]
    })

    const assetOutput = testResult.txOutputs.find((o) => o.address === sender)!
    expect(assetOutput.alphAmount).toEqual(oneAlph - defaultGasFee + amount)
    expect(assetOutput.tokens).toEqual([])
  })
})
