export interface Network {
  nodeHost: string
  explorerApiHost: string
  explorerUrl: string
  networkId: number
  groupIndex: number
  factoryId: string
  routerId: string
}

export interface Settings {
  walletConnectProjectId: string
  networks: Record<NetworkName, Network>
}

export type NetworkName = 'mainnet' | 'testnet' | 'devnet'

export const networks: Record<NetworkName, Network> = {
  mainnet: {
    nodeHost: 'https://mainnet-wallet.alephium.org',
    explorerApiHost: 'https://mainnet-backend.alephium.org',
    explorerUrl: 'https://explorer.alephium.org',
    networkId: 0,
    groupIndex: 0,
    factoryId: '',
    routerId: ''
  },
  testnet: {
    nodeHost: 'https://testnet-wallet.alephium.org',
    explorerApiHost: 'https://testnet-backend.alephium.org',
    explorerUrl: 'https://testnet.alephium.org',
    networkId: 1,
    groupIndex: 0,
    factoryId: '',
    routerId: ''
  },
  devnet: {
    nodeHost: 'http://localhost:22973',
    explorerApiHost: 'http://localhost:9090',
    explorerUrl: 'http://localhost:3000',
    networkId: 4,
    groupIndex: 0,
    factoryId: '3e5a6183fe70ba39ed6aa4c8f6b29605012ba54b7926078701bdd3dcb3896f00', // TODO: load from deployments file
    routerId: 'a18c0679b92ede5e1698ec2edde63ecbe1324f9cd452b94ffc00693cb3a37300'
  }
}

export const settings: Settings = {
  walletConnectProjectId: "6e2562e43678dd68a9070a62b6d52207",
  networks: networks
}

export const networkName: NetworkName = process.env.REACT_APP_NETWORK === 'mainnet'
  ? 'mainnet'
  : process.env.REACT_APP_NETWORK === 'testnet'
  ? 'testnet'
  : "devnet"

export const network: Network = settings.networks[networkName]
