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
import ButtonWithLoader from "../components/ButtonWithLoader";
import TokenSelectDialog from "../components/TokenSelectDialog";
import CircleLoader from "../components/CircleLoader";
import HoverIcon from "../components/HoverIcon";
import NumberTextField from "../components/NumberTextField";
import { useAlephiumWallet } from "../contexts/AlephiumWalletContext";
import useIsWalletReady from "../hooks/useIsWalletReady";
import { COLORS } from "../muiTheme";
import { network } from "../utils/consts";
import { getAmountIn, getAmountOut, getTokenPairState, swap, TokenInfo, TokenPairState } from "../utils/dex";
import AlephiumWalletKey from "../components/AlephiumWalletKey";
import useGetDexTokens from "../hooks/useGetDexTokens";
import { web3 } from "@alephium/web3";

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
  centeredContainer: {
    textAlign: "center",
    width: "100%",
  },
  stepNum: {},
  explainerText: {
    marginBottom: "1rem",
  },
  spacer: {
    height: "1rem",
  },
  mainPaper: {
    padding: "2rem",
    backgroundColor: COLORS.nearBlackWithMinorTransparency,
  },
  downArrow: {
    height: "5rem",
  },
  titleBar: {
    marginTop: "10rem",
    "& > *": {
      margin: ".5rem",
      alignSelf: "flex-end",
    },
  },
  appBar: {
    background: COLORS.nearBlackWithMinorTransparency,
    "& > .MuiToolbar-root": {
      margin: "auto",
      width: "100%",
      maxWidth: 1100,
    },
  },
  link: {
    ...theme.typography.body1,
    color: theme.palette.text.primary,
    marginLeft: theme.spacing(6),
    [theme.breakpoints.down("sm")]: {
      marginLeft: theme.spacing(2.5),
    },
    [theme.breakpoints.down("xs")]: {
      marginLeft: theme.spacing(1),
    },
    "&.active": {
      color: theme.palette.primary.light,
    },
  },
  bg: {
    background:
      "linear-gradient(160deg, rgba(69,74,117,.1) 0%, rgba(138,146,178,.1) 33%, rgba(69,74,117,.1) 66%, rgba(98,104,143,.1) 100%), linear-gradient(45deg, rgba(153,69,255,.1) 0%, rgba(121,98,231,.1) 20%, rgba(0,209,140,.1) 100%)",
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  actionArea: {
    display: "grid",
    placeItems: "center",
    height: "10rem",
    width: "100%",
  },
  content: {
    margin: theme.spacing(2, 0),
    [theme.breakpoints.up("md")]: {
      margin: theme.spacing(4, 0),
    },
  },
  iconButton: {
    [theme.breakpoints.up("md")]: {
      marginRight: theme.spacing(2.5),
    },
    [theme.breakpoints.down("sm")]: {
      marginRight: theme.spacing(2.5),
    },
    [theme.breakpoints.down("xs")]: {
      marginRight: theme.spacing(1),
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
  betaBanner: {
    background: `linear-gradient(to left, ${COLORS.blue}40, ${COLORS.green}40);`,
    padding: theme.spacing(1, 0),
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
  }
}));

function Home() {
  const classes = useStyles();
  web3.setCurrentNodeProvider(network.nodeHost)

  const [tokenInAmount, setTokenInAmount] = useState<bigint | undefined>(undefined)
  const [tokenOutAmount, setTokenOutAmount] = useState<bigint | undefined>(undefined)
  const [tokenInInfo, setTokenInInfo] = useState<TokenInfo | undefined>(undefined);
  const [tokenOutInfo, setTokenOutInfo] = useState<TokenInfo | undefined>(undefined);
  const [lastInput, setLastInput] = useState<'tokenIn' | 'tokenOut' | undefined>(undefined)
  const [tokenPairState, setTokenPairState] = useState<TokenPairState | undefined>(undefined)
  const [completed, setCompleted] = useState<boolean>(false)
  const [swapping, setSwapping] = useState<boolean>(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const { isReady } = useIsWalletReady();
  const wallet = useAlephiumWallet();
  const { dexTokens } = useGetDexTokens(network.factoryId)

  const handleTokenInChange = useCallback((tokenInfo) => {
    setTokenInInfo(tokenInfo);
  }, []);

  const handleTokenOutChange = useCallback((tokenInfo) => {
    setTokenOutInfo(tokenInfo);
  }, []);

  useEffect(() => {
    if (tokenInInfo !== undefined && tokenOutInfo !== undefined) {
      getTokenPairState(tokenInInfo.tokenId, tokenOutInfo.tokenId)
        .then((state) => setTokenPairState(state))
        .catch((error) => setError(error))
    }
  }, [tokenInInfo, tokenOutInfo])

  useEffect(() => {
    try {
      if (tokenPairState !== undefined && tokenInInfo !== undefined && tokenOutInfo !== undefined) {
        if (lastInput === 'tokenIn' && tokenInAmount !== undefined) {
          setTokenOutAmount(getAmountOut(tokenPairState, tokenInInfo.tokenId, tokenInAmount))
        }
        if (lastInput === 'tokenOut' && tokenOutAmount !== undefined) {
          setTokenInAmount(getAmountIn(tokenPairState, tokenOutInfo.tokenId, tokenOutAmount))
        }
      }
    } catch (error) {
      setError(`${error}`)
      console.error(`failed to update token amounts: ${error}`)
    }
  }, [tokenPairState, tokenInInfo, tokenOutInfo, tokenInAmount, tokenOutAmount, lastInput])

  const handleTokenInAmountChange = useCallback(
    (event) => {
      try {
        setError(undefined)
        setLastInput('tokenIn')
        if (event.target.value === '') {
          setTokenInAmount(undefined)
          setTokenOutAmount(undefined)
          return
        }
        const amountIn = BigInt(event.target.value)
        setTokenInAmount(amountIn)
      } catch (error) {
        setError(`${error}`)
        console.error(`handleTokenInAmountChange error: ${error}`)
      }
    }, []
  )

  const handleTokenOutAmountChange = useCallback(
    (event) => {
      try {
        setError(undefined)
        setLastInput('tokenOut')
        if (event.target.value === '') {
          setTokenOutAmount(undefined)
          setTokenInAmount(undefined)
          return
        }
        const amountOut = BigInt(event.target.value)
        setTokenOutAmount(amountOut)
      } catch (error) {
        setError(`${error}`)
        console.log(`handleTokenOutAmountChange error: ${error}`)
      }
    }, []
  )

  const swapTokens = useCallback(() => {
    setTokenInInfo(tokenOutInfo)
    setTokenOutInfo(tokenInInfo)
    setTokenInAmount(tokenOutAmount)
    setTokenOutAmount(tokenInAmount)
    if (lastInput === 'tokenIn') setLastInput('tokenOut')
    else if (lastInput === 'tokenOut') setLastInput('tokenIn')
  }, [tokenInInfo, tokenOutInfo, tokenInAmount, tokenOutAmount, lastInput]);

  const handleReset = useCallback(() => {
    setTokenInInfo(undefined)
    setTokenOutInfo(undefined)
    setTokenInAmount(undefined)
    setTokenOutAmount(undefined)
    setLastInput(undefined)
    setTokenPairState(undefined)
    setCompleted(false)
    setSwapping(false)
    setError(undefined)
  }, [])

  const sourceContent = (
    <div className={classes.tokenContainer}>
      <TokenSelectDialog
        dexTokens={dexTokens}
        tokenAddress={tokenInInfo?.tokenAddress}
        counterpart={tokenOutInfo?.tokenAddress}
        onChange={handleTokenInChange}
        style2={true}
      />
      <NumberTextField
        className={classes.numberField}
        value={tokenInAmount !== undefined ? tokenInAmount.toString() : ''}
        onChange={handleTokenInAmountChange}
        autoFocus={true}
        InputProps={{ disableUnderline: true }}
        disabled={!!swapping || !!completed}
      />
    </div>
  );
  const middleButton = <HoverIcon onClick={swapTokens} />;
  const targetContent = (
    <div className={classes.tokenContainer}>
      <TokenSelectDialog
        dexTokens={dexTokens}
        tokenAddress={tokenOutInfo?.tokenAddress}
        counterpart={tokenInInfo?.tokenAddress}
        onChange={handleTokenOutChange}
      />
      <NumberTextField
        className={classes.numberField}
        value={tokenOutAmount !== undefined ? tokenOutAmount.toString() : ''}
        onChange={handleTokenOutAmountChange}
        autoFocus={true}
        InputProps={{ disableUnderline: true }}
        disabled={!!swapping || !!completed}
      />
    </div>
  );

  const walletButton = <AlephiumWalletKey />;

  const handleSwap = useCallback(async () => {
    try {
      setSwapping(true)
      if (
        wallet.signer !== undefined &&
        tokenPairState !== undefined &&
        tokenInInfo !== undefined &&
        tokenInAmount !== undefined &&
        tokenOutAmount !== undefined
      ) {
        const result = await swap(
          wallet.signer.signerProvider,
          wallet.signer.account.address,
          tokenPairState.tokenPairId,
          tokenInInfo.tokenId,
          tokenInAmount,
          tokenOutAmount
        )
        console.log(`swap succeed, tx id: ${result.txId}`)
        setCompleted(true)
        setSwapping(false)
      }
    } catch (error) {
      setError(`${error}`)
      setSwapping(false)
      console.error(`failed to swap, error: ${error}`)
    }
  }, [wallet, tokenPairState, tokenInInfo, tokenInAmount, tokenOutAmount])

  const readyToSwap =
    wallet.signer !== undefined &&
    tokenInInfo !== undefined &&
    tokenOutInfo !== undefined &&
    tokenInAmount !== undefined &&
    tokenOutAmount !== undefined &&
    !swapping && !completed && isReady
  const swapButton = (
    <ButtonWithLoader
      disabled={!readyToSwap}
      onClick={handleSwap}
      className={
        classes.gradientButton + (!readyToSwap ? " " + classes.disabled : "")
      }
    >
      Swap
    </ButtonWithLoader>
  );

  return (
    <div className={classes.bg}>
      <Container className={classes.centeredContainer} maxWidth="sm">
        <div className={classes.titleBar}></div>
        <Typography variant="h4" color="textSecondary">
          Swap
        </Typography>
        <div className={classes.spacer} />
        <Paper className={classes.mainPaper}>
          <Collapse in={!!completed}>
            <>
              <CheckCircleOutlineRoundedIcon
                fontSize={"inherit"}
                className={classes.successIcon}
              />
              <Typography>Swap succeed!</Typography>
              <div className={classes.spacer} />
              <div className={classes.spacer} />
              <Button onClick={handleReset} variant="contained" color="primary">
                Swap More Coins
              </Button>
            </>
          </Collapse>
          <div className={classes.loaderHolder}>
            <Collapse in={!!swapping && !completed}>
              <div className={classes.loaderHolder}>
                <CircleLoader />
                <div className={classes.spacer} />
                <div className={classes.spacer} />
                <Typography variant="h5">
                  Swapping...
                </Typography>
                <div className={classes.spacer} />
              </div>
            </Collapse>
          </div>
          <div>
            <Collapse in={!swapping && !completed}>
              {
                <>
                  {sourceContent}
                  {middleButton}
                  {targetContent}
                  {error ? (
                    <Typography variant="body2" color="error" className={classes.error}>
                      {error}
                    </Typography>
                  ) : null}
                  <div className={classes.spacer} />
                </>
              }
              {walletButton}
              {swapButton}
            </Collapse>
          </div>
        </Paper>
        <div className={classes.spacer} />
      </Container>
    </div>
  );
}

export default Home;
