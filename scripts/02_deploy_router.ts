import { Project } from '@alephium/web3'
import { Deployer, DeployFunction } from '@alephium/cli'

const deployRouter: DeployFunction<undefined> = async (deployer: Deployer): Promise<void> => {
  const router = Project.contract('Router')
  const result = await deployer.deployContract(router, {
    initialFields: {}
  })
  console.log(`Router contract address: ${result.contractAddress}, contract id: ${result.contractId}`)
}

export default deployRouter
