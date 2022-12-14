import {
  Box,
  Container,
  makeStyles,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText
} from "@material-ui/core";
import { ExpandLess, ExpandMore } from "@material-ui/icons";
import Collapse from "@material-ui/core/Collapse";
import { useState } from "react";
import { COLORS } from "../muiTheme";
import { getTokenPairState, TokenPairState, DexTokens, TokenPair } from "../utils/dex";

const useStyles = makeStyles((theme) => ({
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
  text: {
    fontFamily: "monospace",
    whiteSpace: "pre",
    fontSize: "15px"
  },
  list: {
    width: '100%'
  },
}));

function ListTokenPair({ tokenPair, onError }: { tokenPair: TokenPair, onError: any }) {
  const classes = useStyles()
  const [open, setOpen] = useState(false)
  const [tokenPairState, setTokenPairState] = useState<TokenPairState | undefined>(undefined)

  const handleClick = () => {
    setOpen(!open)
    getTokenPairState(tokenPair.token0Id, tokenPair.token1Id)
      .then((state) => setTokenPairState(state))
      .catch((error) => onError(error))
  }

  return (<>
    <ListItem key={tokenPair.tokenPairId} button onClick={handleClick}>
      <ListItemText>
        <Box className={classes.text}>{tokenPair.tokenPairId.slice(0, 8)}</Box>
      </ListItemText>
      {open ? <ExpandLess /> : <ExpandMore />}
    </ListItem>
    <Collapse in={open}>
      {tokenPairState ? (
        <>
        <div className={classes.notification}>
          <p className={classes.leftAlign}>Token Pair Id:</p>
          <p className={classes.rightAlign}>{tokenPair.tokenPairId}</p>
        </div>
        <div className={classes.notification}>
          <p className={classes.leftAlign}>Token0:</p>
          <p className={classes.rightAlign}>{tokenPair.token0Id}</p>
        </div>
        <div className={classes.notification}>
          <p className={classes.leftAlign}>Token1:</p>
          <p className={classes.rightAlign}>{tokenPair.token1Id}</p>
        </div>
        <div className={classes.notification}>
          <p className={classes.leftAlign}>Reserve0:</p>
          <p className={classes.rightAlign}>{tokenPairState.reserve0.toString()}</p>
        </div>
        <div className={classes.notification}>
          <p className={classes.leftAlign}>Reserve1:</p>
          <p className={classes.rightAlign}>{tokenPairState.reserve1.toString()}</p>
        </div>
        <div className={classes.notification}>
          <p className={classes.leftAlign}>Total Supply:</p>
          <p className={classes.rightAlign}>{tokenPairState.totalSupply.toString()}</p>
        </div>
        </>
      ) : null}
    </Collapse>
  </>)
}

function Pools({ dexTokens }: { dexTokens: DexTokens }) {
  const classes = useStyles();
  const [error, setError] = useState<string | undefined>(undefined)

  const tokenLists = dexTokens.tokenPairs.map((tokenPair) =>
    <ListTokenPair
      key={tokenPair.tokenPairId}
      tokenPair={tokenPair}
      onError={(err: any) => setError(err)}
    />
  )

  return (
    <Container className={classes.centeredContainer}>
      <div className={classes.titleBar}></div>
      <Typography variant="h4" color="textSecondary">
        Pools
      </Typography>
      <div className={classes.spacer} />
      <Paper className={classes.mainPaper}>
        <div>
          <Collapse in={true}>
            {error === undefined ? (
              <List component="nav" className={classes.list} style={{maxHeight: 500, overflow: 'auto'}}>{tokenLists}</List>
            ) : null}
            {error ? (
              <Typography variant="body2" color="error" className={classes.error}>
                {error}
              </Typography>
            ) : null}
          </Collapse>
        </div>
      </Paper>
      <div className={classes.spacer} />
    </Container>
  );
}

export default Pools;
