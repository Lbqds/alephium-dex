import { useMemo } from "react";
import { useAlephiumWallet } from "../contexts/AlephiumWalletContext";

const createWalletStatus = (
  isReady: boolean,
  statusMessage: string = "",
  walletAddress?: string
) => ({
  isReady,
  statusMessage,
  walletAddress,
});

function useIsWalletReady(): {
  isReady: boolean;
  walletAddress?: string;
  statusMessage: string;
} {
  const { signer } = useAlephiumWallet()

  return useMemo(() => {
    if (signer?.account.address) {
      return createWalletStatus(
        true,
        undefined,
        signer.account.address
      );
    }
    return createWalletStatus(
      false,
      "Wallet not connected",
      undefined
    );
  }, [signer]);
}

export default useIsWalletReady;
