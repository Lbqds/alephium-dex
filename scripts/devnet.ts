import { getEnv } from '@alephium/cli'
import { binToHex, contractIdFromAddress, node, NodeProvider, Project, SignerProvider, web3 } from '@alephium/web3'
import { PrivateKeyWallet } from '@alephium/web3-wallet'
import { program } from 'commander'
import { randomInt } from 'crypto'
import { default as devnetDeployment } from '../.deployments.devnet.json'

const alphTokenId = ''.padStart(64, '0')
const oneAlph = 10n ** 18n

async function createTokens(signer: SignerProvider, num: number): Promise<string[]> {
  const contract = Project.contract('TestToken')
  const script = Project.script('GetToken')
  const tokenIds: string[] = []
  const account = await signer.getSelectedAccount()
  const nodeProvider = signer.nodeProvider ?? web3.getCurrentNodeProvider()
  for (let i = 0; i < num; i++) {
    const deployResult = await contract.deploy(signer, { issueTokenAmount: 1n << 255n })
    await waitTxConfirmed(nodeProvider, deployResult.txId, 1)
    tokenIds.push(deployResult.contractId)

    const scriptResult = await script.execute(signer, {
      initialFields: {
        token: deployResult.contractId,
        sender: account.address,
        amount: 1n << 100n
      },
      attoAlphAmount: oneAlph
    })
    await waitTxConfirmed(nodeProvider, scriptResult.txId, 1)
    console.log(
      `Create test token succeed, token id: ${deployResult.contractId}, token address: ${deployResult.contractAddress}`
    )
  }
  return [alphTokenId].concat(tokenIds.sort(sortToken))
}

function sortToken(tokenAId: string, tokenBId: string): number {
  const tokenA = BigInt('0x' + tokenAId)
  const tokenB = BigInt('0x' + tokenBId)
  return tokenA > tokenB ? 1 : -1
}

interface TokenPair {
  token0Id: string
  token1Id: string
  tokenPairId: string
}

async function createPairs(signer: SignerProvider, tokenFactoryId: string, tokenIds: string[]): Promise<TokenPair[]> {
  const script = Project.script('CreatePair')
  const account = await signer.getSelectedAccount()
  const nodeProvider = signer.nodeProvider ?? web3.getCurrentNodeProvider()
  const tokenPair: TokenPair[] = []
  for (let token0Index = 0; token0Index < tokenIds.length - 1; token0Index++) {
    for (let token1Index = token0Index + 1; token1Index < tokenIds.length; token1Index++) {
      const token0Id = tokenIds[token0Index]
      const token1Id = tokenIds[token1Index]
      const result = await script.execute(signer, {
        initialFields: {
          payer: account.address,
          factory: tokenFactoryId,
          alphAmount: oneAlph,
          tokenAId: token0Id,
          tokenBId: token1Id
        },
        attoAlphAmount: 2n * oneAlph,
        tokens: [
          { id: token0Id, amount: 1n },
          { id: token1Id, amount: 1n }
        ]
      })
      await waitTxConfirmed(nodeProvider, result.txId, 1)
      const tokenPairId = await getCreatedContractId(nodeProvider, result.txId)
      console.log(`Create pair succeed, token0Id: ${token0Id}, token1Id: ${token1Id}, tokenPairId: ${tokenPairId}`)
      tokenPair.push({ token0Id, token1Id, tokenPairId })
    }
  }
  return tokenPair
}

function calcRatios(tokens: string[]): Map<string, bigint> {
  const ratios = new Map<string, bigint>()
  const firstTokenId = tokens[0]
  const remainTokens = tokens.slice(1)
  let lastOne = 0n
  remainTokens.forEach((tokenId) => {
    const ratio = (BigInt(randomInt(1, 100)) + lastOne) * 10n
    ratios.set(firstTokenId + tokenId, ratio)
    lastOne = ratio
  })

  for (let token0Index = 1; token0Index <= remainTokens.length - 1; token0Index++) {
    for (let token1Index = token0Index + 1; token1Index <= remainTokens.length; token1Index++) {
      const token0Id = tokens[token0Index]
      const token1Id = tokens[token1Index]
      const ratio0 = ratios.get(firstTokenId + token0Id) as bigint
      const ratio1 = ratios.get(firstTokenId + token1Id) as bigint
      const ratio = ratio1 / ratio0
      ratios.set(token0Id + token1Id, ratio)
    }
  }
  return ratios
}

async function addInitialLiquidity(
  signer: SignerProvider,
  tokenPairs: TokenPair[],
  ratios: Map<string, bigint>
): Promise<void> {
  const script = Project.script('AddLiquidity')
  const account = await signer.getSelectedAccount()
  const nodeProvider = signer.nodeProvider ?? web3.getCurrentNodeProvider()
  const routerId = devnetDeployment[0].deployContractResults.Router.contractId
  for (let index = 0; index < tokenPairs.length; index++) {
    const tokenPair = tokenPairs[index]
    const ratio = ratios.get(tokenPair.token0Id + tokenPair.token1Id) as bigint
    const token0Amount = BigInt(randomInt(1, 100)) * 10n ** 18n
    const token1Amount = ratio * token0Amount
    const result = await script.execute(signer, {
      initialFields: {
        sender: account.address,
        router: routerId,
        pair: tokenPair.tokenPairId,
        amount0Desired: token0Amount,
        amount1Desired: token1Amount,
        amount0Min: token0Amount,
        amount1Min: token1Amount,
        deadline: BigInt(Date.now() + 60000)
      },
      attoAlphAmount: oneAlph,
      tokens: [
        { id: tokenPair.token0Id, amount: token0Amount },
        { id: tokenPair.token1Id, amount: token1Amount }
      ]
    })
    await waitTxConfirmed(nodeProvider, result.txId, 1)
    console.log(
      `Add liquidity for token pair ${tokenPair.tokenPairId} succeed, token0Id: ${tokenPair.token0Id}, token1Id: ${tokenPair.token1Id}, token0Amount: ${token0Amount}, token1Amount: ${token1Amount}`
    )
  }
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

export async function getCreatedContractId(provider: NodeProvider, txId: string, outputIndex = 0): Promise<string> {
  const tx = await provider.transactions.getTransactionsDetailsTxid(txId)
  const address = tx.generatedOutputs[outputIndex].address
  return binToHex(contractIdFromAddress(address))
}

program
  .command('create-tokens')
  .description('create test tokens on devnet')
  .requiredOption('-n, --num <number>', 'token number')
  .option('--create-pair', 'create token pairs', false)
  .option('--init', 'add init liquidity for token pairs', false)
  .action(async (opts) => {
    const tokenNumber = opts.num as number
    const env = await getEnv()
    const signer = PrivateKeyWallet.FromMnemonic(env.network.mnemonic)

    const factoryId = devnetDeployment[0].deployContractResults.TokenPairFactory.contractId
    const tokenIds = await createTokens(signer, tokenNumber)
    if (opts.createPair && opts.init) {
      const tokenPairs = await createPairs(signer, factoryId, tokenIds)
      const ratios = calcRatios(tokenIds)
      await addInitialLiquidity(signer, tokenPairs, ratios)
      return
    }

    if (opts.createPair) {
      await createPairs(signer, factoryId, tokenIds)
    }
  })

program
  .command('transfer-tokens')
  .description('transfer test tokens on devnet')
  .requiredOption('--to <string>', 'to address')
  .requiredOption('--token-id <string>', 'token id')
  .requiredOption('--amount <string>', 'trasfer amount')
  .action(async (opts) => {
    const env = await getEnv()
    const signer = PrivateKeyWallet.FromMnemonic(env.network.mnemonic)
    const transferAmount = BigInt(opts.amount as string)
    const result = await signer.signAndSubmitTransferTx({
      signerAddress: signer.address,
      destinations: [
        {
          address: opts.to as string,
          attoAlphAmount: 10n ** 18n,
          tokens: [{ id: opts.tokenId as string, amount: transferAmount }]
        }
      ]
    })
    await waitTxConfirmed(web3.getCurrentNodeProvider(), result.txId, 1)
    console.log(`transfer succeed, tx id: ${result.txId}`)
  })

program.parse()
