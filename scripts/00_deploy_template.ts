import { Project } from '@alephium/web3'
import { Deployer, DeployFunction } from '@alephium/cli'

const deployTokenPairTemplate: DeployFunction<undefined> = async (deployer: Deployer): Promise<void> => {
  const tokenPair = Project.contract('TokenPair')
  const initialFields = {
    token0Id: '',
    token1Id: '',
    reserve0: 0n,
    reserve1: 0n,
    blockTimeStampLast: 0n,
    price0CumulativeLast: 0n,
    price1CumulativeLast: 0n,
    totalSupply: 0n
  }

  const result = await deployer.deployContract(tokenPair, {
    initialFields: initialFields
  })
  console.log(`TokenPair template contract address: ${result.contractAddress}, contract id: ${result.contractId}`)
}

export default deployTokenPairTemplate
