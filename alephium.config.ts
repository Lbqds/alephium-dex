import { Configuration } from '@alephium/cli'

const configuration: Configuration<undefined> = {
  artifactDir: '../sdk/js/src/alephium/artifacts',

  defaultNetwork: 'devnet',
  toDeployGroups: [0],
  networks: {
    devnet: {
      nodeUrl: 'http://localhost:22973',
      mnemonic:
        'vault alarm sad mass witness property virus style good flower rice alpha viable evidence run glare pretty scout evil judge enroll refuse another lava',
      settings: undefined
    },

    testnet: {
      nodeUrl: process.env.NODE_URL as string,
      mnemonic: process.env.MNEMONIC as string,
      settings: undefined
    },

    mainnet: {
      nodeUrl: process.env.NODE_URL as string,
      mnemonic: process.env.MNEMONIC as string,
      settings: undefined
    }
  },

  compilerOptions: {
    errorOnWarnings: true,
    ignoreUnusedConstantsWarnings: true
  }
}

export default configuration
