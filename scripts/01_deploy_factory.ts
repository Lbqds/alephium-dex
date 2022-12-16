import { Project } from '@alephium/web3'
import { Deployer, DeployFunction } from '@alephium/cli'

const deployFactory: DeployFunction<undefined> = async (deployer: Deployer): Promise<void> => {
  const tokenPairTemplate = deployer.getDeployContractResult('TokenPair')
  const factory = Project.contract('TokenPairFactory')
  const initialFields = {
    pairTemplateId: tokenPairTemplate.contractId,
    pairSize: 0n
  }

  const result = await deployer.deployContract(factory, {
    initialFields: initialFields
  })
  console.log(`TokenPairFactory contract address: ${result.contractAddress}, contract id: ${result.contractId}`)
}

export default deployFactory
