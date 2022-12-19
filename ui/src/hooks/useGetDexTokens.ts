import {
  addressFromContractId,
  EventSubscription,
  node,
  SubscribeOptions,
  subscribeToEvents,
  Subscription
} from "@alephium/web3";
import { useEffect, useMemo, useState } from "react";
import { DexTokens } from "../utils/dex";

function useGetDexTokens(factoryId: string): {
  subscription: EventSubscription | undefined
  dexTokens: DexTokens
} {
  const [dexTokens, setDexTokens] = useState<DexTokens>(new DexTokens())
  const [subscription, setSubscription] = useState<EventSubscription | undefined>(undefined)

  useEffect(() => {
    const messageCallback = (event: node.ContractEvent) => {
      const token0Id = event.fields[0].value as string
      const token1Id = event.fields[1].value as string
      const token0Address = addressFromContractId(token0Id)
      const token1Address = addressFromContractId(token1Id)
      const tokenPairId = event.fields[2].value as string

      setDexTokens((current) => {
        // TODO: load logo from configs
        const tokenInfos = [
          { tokenId: token0Id, tokenAddress: token0Address, name: token0Id.slice(0, 8), logo: '' },
          { tokenId: token1Id, tokenAddress: token1Address, name: token1Id.slice(0, 8), logo: '' }
        ]
        const tokenPairs = [{ token0Id, token1Id, token0Address, token1Address, tokenPairId }]
        return current
          .addTokenInfos(tokenInfos)
          .addTokenPairs(tokenPairs)
          .addMappings([[token0Address, [token1Address]], [token1Address, [token0Address]]])
      })
      return Promise.resolve()
    }
    const errorCallback = (error: any, s: Subscription<node.ContractEvent>) => {
      s.unsubscribe()
      console.error(`Subscription error: ${error}`)
      return Promise.resolve()
    }
    const options: SubscribeOptions<node.ContractEvent> = {
      pollingInterval: 5000,
      messageCallback: messageCallback,
      errorCallback: errorCallback
    }
    const factoryAddress = addressFromContractId(factoryId)
    const subscription = subscribeToEvents(options, factoryAddress, 0)
    setSubscription(subscription)
  }, [factoryId])

  return useMemo(() => {
    return {
      subscription,
      dexTokens 
    }
  }, [subscription, dexTokens])
}

export default useGetDexTokens;
