export interface Network {
  nodeHost: string
  explorerApiHost: string
  explorerUrl: string
  networkId: number
  groupIndex: number
  factoryId: string
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
    factoryId: ''
  },
  testnet: {
    nodeHost: 'https://testnet-wallet.alephium.org',
    explorerApiHost: 'https://testnet-backend.alephium.org',
    explorerUrl: 'https://testnet.alephium.org',
    networkId: 1,
    groupIndex: 0,
    factoryId: ''
  },
  devnet: {
    nodeHost: 'http://localhost:22973',
    explorerApiHost: 'http://localhost:9090',
    explorerUrl: 'http://localhost:3000',
    networkId: 4,
    groupIndex: 0,
    factoryId: '430feb00627cd3a327da09f2f141116c279020d1926f03bc43faf8bca88c5100' // TODO: load from deployments file
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
