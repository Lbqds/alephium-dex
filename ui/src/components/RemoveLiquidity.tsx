import {
  Button,
  Container,
  makeStyles,
  Paper,
  Typography,
} from "@material-ui/core";
import Collapse from "@material-ui/core/Collapse";
import CheckCircleOutlineRoundedIcon from "@material-ui/icons/CheckCircleOutlineRounded";
import { useCallback, useEffect, useState } from "react";
import ButtonWithLoader from "./ButtonWithLoader";
import TokenSelectDialog from "./TokenSelectDialog";
import CircleLoader from "./CircleLoader";
import NumberTextField from "./NumberTextField";
import { useAlephiumWallet } from "../contexts/AlephiumWalletContext";
import useIsWalletReady from "../hooks/useIsWalletReady";
import { COLORS } from "../muiTheme";
import { network } from "../utils/consts";
import {
  getTokenPairState,
  TokenInfo,
  TokenPairState,
  removeLiquidity,
  RemoveLiquidityResult,
  getRemoveLiquidityResult,
  getBalance
} from "../utils/dex";
import AlephiumWalletKey from "./AlephiumWalletKey";
import useGetDexTokens from "../hooks/useGetDexTokens";

const useStyles = makeStyles((theme) => ({
  numberField: {
    flexGrow: 1,
    "& > * > .MuiInputBase-input": {
      textAlign: "right",
      height: "100%",
      flexGrow: "1",
      fontSize: "1.5rem",
      fontFamily: "Roboto Mono, monospace",
      caretShape: "block",
      width: "0",
      "&::-webkit-outer-spin-button, &::-webkit-inner-spin-button": {
        "-webkit-appearance": "none",
        "-moz-appearance": "none",
        margin: 0,
      },
      "&:invalid": {
        color: "red"
      },
      "&[type=number]": {
        "-webkit-appearance": "textfield",
        "-moz-appearance": "textfield",
      },
    },
    "& > * > input::-webkit-inner-spin-button": {
      webkitAppearance: "none",
      margin: "0",
    },
  },
  tokenContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    border: "3px solid #333333",
    padding: ".6rem",
    borderRadius: "10px",
    "& > *": {
      margin: ".1rem",
    },
    margin: ".5rem 0rem .5rem 0rem",
    height: "60px"
  },
  tokenPairContainer: {
    display: "flex",
    justifyContent: "space-between",
    margin: ".5rem 0rem .5rem 0rem",
    height: "30px"
  },
  centeredContainer: {
    textAlign: "center",
    width: "100%",
  },
  spacer: {
    height: "1rem",
  },
  mainPaper: {
    padding: "2rem",
    backgroundColor: COLORS.nearBlackWithMinorTransparency,
  },
  titleBar: {
    marginTop: "10rem",
    "& > *": {
      margin: ".5rem",
      alignSelf: "flex-end",
    },
  },
  gradientButton: {
    backgroundImage: `linear-gradient(45deg, ${COLORS.blue} 0%, ${COLORS.nearBlack}20 50%,  ${COLORS.blue}30 62%, ${COLORS.nearBlack}50  120%)`,
    transition: "0.75s",
    backgroundSize: "200% auto",
    boxShadow: "0 0 20px #222",
    "&:hover": {
      backgroundPosition:
        "right center" /* change the direction of the change here */,
    },
    width: "100%",
    height: "3rem",
    marginTop: "1rem",
  },
  disabled: {
    background: COLORS.gray,
  },
  loaderHolder: {
    display: "flex",
    justifyContent: "center",
    flexDirection: "column",
    alignItems: "center",
  },
  successIcon: {
    color: COLORS.green,
    fontSize: "200px",
  },
  error: {
    marginTop: theme.spacing(1),
    textAlign: "center",
  },
  notification: {
    display: 'flex',
    justifyContent: 'space-between'
  },
  leftAlign: {
    textAlign: "left",
    fontSize: "15px",
    fontFamily: "monospace"
  },
  rightAlign: {
    textAlign: "right",
    fontSize: "15px",
    fontFamily: "monospace"
  },
}));

function RemoveLiquidity() {
  const classes = useStyles();
  const [amount, setAmount] = useState<bigint | undefined>(undefined)
  const [tokenAInfo, setTokenAInfo] = useState<TokenInfo | undefined>(undefined)
  const [tokenBInfo, setTokenBInfo] = useState<TokenInfo | undefined>(undefined)
  const [tokenPairState, setTokenPairState] = useState<TokenPairState | undefined>(undefined)
  const [totalLiquidityAmount, setTotalLiquidityAmount] = useState<bigint | undefined>(undefined)
  const [removeLiquidityResult, setRemoveLiquidityResult] = useState<RemoveLiquidityResult | undefined>(undefined)
  const [completed, setCompleted] = useState<boolean>(false)
  const [removingLiquidity, setRemovingLiquidity] = useState<boolean>(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const { isReady } = useIsWalletReady();
  const wallet = useAlephiumWallet();
  const { dexTokens } = useGetDexTokens(network.factoryId)

  const handleTokenAChange = useCallback((tokenInfo) => {
    setTokenAInfo(tokenInfo);
  }, []);

  const handleTokenBChange = useCallback((tokenInfo) => {
    setTokenBInfo(tokenInfo)
  }, []);

  useEffect(() => {
    setRemoveLiquidityResult(undefined)
    setTotalLiquidityAmount(undefined)
    if (
      tokenAInfo !== undefined &&
      tokenBInfo !== undefined &&
      wallet.signer !== undefined &&
      isReady
    ) {
      const address = wallet.signer.account.address
      getTokenPairState(tokenAInfo.tokenId, tokenBInfo.tokenId)
        .then((state) => {
          setTokenPairState(state)
          getBalance(state.tokenPairId, address)
            .then((balance) => setTotalLiquidityAmount(balance))
            .catch((error) => setError(error))
        })
        .catch((error) => setError(error))
    }
  }, [tokenAInfo, tokenBInfo, isReady, wallet])

  useEffect(() => {
    setRemoveLiquidityResult(undefined)
    try {
      if (
        tokenPairState !== undefined &&
        tokenAInfo !== undefined &&
        tokenBInfo !== undefined &&
        amount !== undefined &&
        totalLiquidityAmount !== undefined
      ) {
        const removeLiqiudityResult = getRemoveLiquidityResult({ ...tokenPairState, totalLiquidityAmount }, amount)
        setRemoveLiquidityResult(removeLiqiudityResult)
      }
    } catch (error) {
      setError(`${error}`)
      console.error(`failed to update token amounts: ${error}`)
    }
  }, [tokenPairState, tokenAInfo, tokenBInfo, amount, totalLiquidityAmount])

  const handleAmountChanged = useCallback(
    (event) => {
      try {
        setError(undefined)
        setRemoveLiquidityResult(undefined)
        if (event.target.value === '') {
          setAmount(undefined)
          return
        }
        setAmount(BigInt(event.target.value))
      } catch (error) {
        setError(`${error}`)
        console.error(`handleAmountChanged error: ${error}`)
      }
    }, []
  )

  const handleReset = useCallback(() => {
    setTokenAInfo(undefined)
    setTokenBInfo(undefined)
    setTokenPairState(undefined)
    setAmount(undefined)
    setTotalLiquidityAmount(undefined)
    setCompleted(false)
    setRemovingLiquidity(false)
    setRemoveLiquidityResult(undefined)
    setError(undefined)
  }, [])

  const tokenPairContent = (
    <div className={classes.tokenPairContainer}>
      <TokenSelectDialog
        dexTokens={dexTokens}
        tokenAddress={tokenAInfo?.tokenAddress}
        counterpart={tokenBInfo?.tokenAddress}
        onChange={handleTokenAChange}
        mediumSize={true}
      />
      <TokenSelectDialog
        dexTokens={dexTokens}
        tokenAddress={tokenBInfo?.tokenAddress}
        counterpart={tokenAInfo?.tokenAddress}
        onChange={handleTokenBChange}
        mediumSize={true}
      />
    </div>
  )
  
  const amountInput = (
    <div className={classes.tokenContainer}>
      <NumberTextField
        className={classes.numberField}
        value={amount !== undefined ? amount.toString() : ''}
        onChange={handleAmountChanged}
        autoFocus={true}
        InputProps={{ disableUnderline: true }}
        disabled={!!removingLiquidity || !!completed}
      />
    </div>
  )

  const walletButton = <AlephiumWalletKey />;

  const handleRemoveLiquidity = useCallback(async () => {
    try {
      setRemovingLiquidity(true)
      if (
        wallet.signer !== undefined &&
        tokenPairState !== undefined &&
        removeLiquidityResult !== undefined &&
        tokenAInfo !== undefined &&
        tokenBInfo !== undefined &&
        amount !== undefined
      ) {
        const result = await removeLiquidity(
          wallet.signer.signerProvider,
          wallet.signer.account.address,
          tokenPairState.tokenPairId,
          amount,
          tokenAInfo.tokenId === tokenPairState.token0Id ? removeLiquidityResult.amount0 : removeLiquidityResult.amount1,
          tokenAInfo.tokenId === tokenPairState.token0Id ? removeLiquidityResult.amount1 : removeLiquidityResult.amount0,
        )
        console.log(`remove liquidity succeed, tx id: ${result.txId}`)
        setCompleted(true)
        setRemovingLiquidity(false)
      }
    } catch (error) {
      setError(`${error}`)
      setRemovingLiquidity(false)
      console.error(`failed to remove liquidity, error: ${error}`)
    }
  }, [wallet, tokenPairState, tokenAInfo, tokenBInfo, amount, removeLiquidityResult])

  const readyToRemoveLiquidity =
    wallet.signer !== undefined &&
    tokenAInfo !== undefined &&
    tokenBInfo !== undefined &&
    amount !== undefined &&
    totalLiquidityAmount !== undefined &&
    removeLiquidityResult !== undefined &&
    !removingLiquidity && !completed && isReady && 
    error === undefined
  const removeLiquidityButton = (
    <ButtonWithLoader
      disabled={!readyToRemoveLiquidity}
      onClick={handleRemoveLiquidity}
      className={
        classes.gradientButton + (!readyToRemoveLiquidity ? " " + classes.disabled : "")
      }
    >
      Remove Liquidity
    </ButtonWithLoader>
  );

  const getTokenAmount = (removeLiquidityResult: RemoveLiquidityResult, tokenId: string): bigint => {
    return tokenId === removeLiquidityResult.token0Id ? removeLiquidityResult.amount0 : removeLiquidityResult.amount1
  }

  return (
    <Container className={classes.centeredContainer} maxWidth="sm">
      <div className={classes.titleBar}></div>
      <Typography variant="h4" color="textSecondary">
        Remove Liquidity
      </Typography>
      <div className={classes.spacer} />
      <Paper className={classes.mainPaper}>
        <Collapse in={!!completed}>
          <>
            <CheckCircleOutlineRoundedIcon
              fontSize={"inherit"}
              className={classes.successIcon}
            />
            <Typography>Remove liquidity succeed!</Typography>
            <div className={classes.spacer} />
            <div className={classes.spacer} />
            <Button onClick={handleReset} variant="contained" color="primary">
              Remove More Liquidity!
            </Button>
          </>
        </Collapse>
        <div className={classes.loaderHolder}>
          <Collapse in={!!removingLiquidity && !completed}>
            <div className={classes.loaderHolder}>
              <CircleLoader />
              <div className={classes.spacer} />
              <div className={classes.spacer} />
              <Typography variant="h5">
                Removing liquidity...
              </Typography>
              <div className={classes.spacer} />
            </div>
          </Collapse>
        </div>
        <div>
          <Collapse in={!removingLiquidity && !completed}>
            {isReady ? (
              <>
                {tokenPairContent}
                <div className={classes.spacer} />
                {totalLiquidityAmount !== undefined ? (
                  <>
                    <div className={classes.notification}>
                      <p className={classes.leftAlign}>Total share amount:</p>
                      <p className={classes.rightAlign}>{totalLiquidityAmount.toString()}</p>
                    </div>
                  </>
                ): null}
                {amountInput}
                {removeLiquidityResult && amount ? (
                  <>
                    <div className={classes.notification}>
                      <p className={classes.leftAlign}>Remove share amount:</p>
                      <p className={classes.rightAlign}>{amount.toString()}</p>
                    </div>
                    <div className={classes.notification}>
                      <p className={classes.leftAlign}>Token {tokenAInfo!.tokenId.slice(0, 8)}:</p>
                      <p className={classes.rightAlign}>{getTokenAmount(removeLiquidityResult, tokenAInfo!.tokenId).toString()}</p>
                    </div>
                    <div className={classes.notification}>
                      <p className={classes.leftAlign}>Token {tokenBInfo!.tokenId.slice(0, 8)}:</p>
                      <p className={classes.rightAlign}>{getTokenAmount(removeLiquidityResult, tokenBInfo!.tokenId).toString()}</p>
                    </div>
                    <div className={classes.notification}>
                      <p className={classes.leftAlign}>Remain share amount:</p>
                      <p className={classes.rightAlign}>{removeLiquidityResult.remainShareAmount.toString()}</p>
                    </div>
                    <div className={classes.notification}>
                      <p className={classes.leftAlign}>Remain share percentage:</p>
                      <p className={classes.rightAlign}>{removeLiquidityResult.remainSharePercentage}%</p>
                    </div>
                  </>
                ): null}
                {error ? (
                  <Typography variant="body2" color="error" className={classes.error}>
                    {error}
                  </Typography>
                ) : null}
                <div className={classes.spacer} />
                {walletButton}
                {removeLiquidityButton}
              </>) : <> {walletButton} </>
            }
          </Collapse>
        </div>
      </Paper>
      <div className={classes.spacer} />
    </Container>
  );
}

export default RemoveLiquidity;
