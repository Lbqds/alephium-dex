import {
  Box,
  Card,
  Dialog,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  makeStyles,
  Typography,
} from "@material-ui/core";
import { useCallback, useState } from "react";
import CloseIcon from "@material-ui/icons/Close";
import alephiumIcon from "../icons/alephium.svg";
import { DexTokens, TokenInfo } from "../utils/dex";

const useStyles = makeStyles((theme) => ({
  flexTitle: {
    display: "flex",
    alignItems: "center",
    "& > div": {
      flexGrow: 1,
      marginRight: theme.spacing(4),
    },
    "& > button": {
      marginRight: theme.spacing(-1),
    },
  },
  selectedCard: {
    "&:hover": {
      cursor: "pointer",
      boxShadow: "inset 0 0 50px 50px rgba(255, 255, 255, 0.1)",
    },
    display: "flex",
    alignItems: "center",
    height: 25,
    width: "max-content",
    padding: ".5rem",
    background:
      "linear-gradient(90deg, rgba(69,74,117,.2) 0%, rgba(138,146,178,.2) 33%, rgba(69,74,117,.5) 66%, rgba(98,104,143,.5) 100%), linear-gradient(45deg, rgba(153,69,255,.1) 0%, rgba(121,98,231,.1) 20%, rgba(0,209,140,.1) 100%)",
  },
  style2: {
    background:
      "linear-gradient(270deg, rgba(69,74,117,.2) 0%, rgba(138,146,178,.2) 33%, rgba(69,74,117,.5) 66%, rgba(98,104,143,.5) 100%), linear-gradient(45deg, rgba(153,69,255,.1) 0%, rgba(121,98,231,.1) 20%, rgba(0,209,140,.1) 100%)",
  },
  selectedSymbol: {
    fontFamily: "Monospace",
    margin: ".5rem",
    fontSize: "15px"
  },
  listItemIcon: {
    width: 100
  },
  icon: {
    height: 20,
    maxWidth: 20,
  },
}));

interface TokenSelectProps {
  dexTokens: DexTokens
  tokenAddress: string | undefined
  counterpart: string | undefined
  onChange: any
  style2?: boolean
}

const TokenOptions = ({
  tokenInfo,
  onSelect,
  close,
}: {
  tokenInfo: TokenInfo;
  onSelect: (tokenInfo: TokenInfo) => void;
  close: () => void;
}) => {
  const classes = useStyles();

  const handleClick = useCallback(() => {
    onSelect(tokenInfo);
    close();
  }, [tokenInfo, onSelect, close]);

  return (
    <ListItem button onClick={handleClick} key={tokenInfo.tokenAddress}>
      <ListItemIcon className={classes.listItemIcon}>
        <img
          // TODO: set logo properly
          src={alephiumIcon}
          // alt={tokenInfo.name}
          className={classes.icon}
        />
      </ListItemIcon>
      <ListItemText>
        <Box fontFamily="Monospace" fontWeight="fontWeightMedium">{tokenInfo.tokenAddress}</Box>
      </ListItemText>
    </ListItem>
  );
};

export default function TokenSelectDialog({
  dexTokens,
  tokenAddress,
  counterpart,
  onChange,
  style2,
}: TokenSelectProps) {
  const classes = useStyles();
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [])
  const handleClick = useCallback(() => {
    setOpen(true)
  }, [])

  const info = dexTokens.tokenInfos.find((x) => x.tokenAddress === tokenAddress);
  const availableTokens = dexTokens.getAllowedTokenInfos(counterpart).map((token) =>
    <TokenOptions
      tokenInfo={token}
      onSelect={onChange}
      close={handleClose}
    />
  );

  return (
    <>
      <Card
        onClick={handleClick}
        raised
        className={classes.selectedCard + (style2 ? " " + classes.style2 : "")}
      >
        {info ? (
          <>
            <img
              // TODO: set logo properly
              // src={alephiumIcon}
              className={classes.icon}
              // alt={"coin logo"}
            />
            <Typography variant="h6" className={classes.selectedSymbol}>
              {info.name}
            </Typography>
          </>
          ): (
            <Typography variant="h6" className={classes.selectedSymbol}>
              Select token
            </Typography>
          )
        }
      </Card>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>
          <div className={classes.flexTitle}>
            <div>Select token</div>
            <IconButton onClick={handleClose}>
              <CloseIcon />
            </IconButton>
          </div>
        </DialogTitle>
        <List>{availableTokens}</List>
      </Dialog>
    </>
  );
}
