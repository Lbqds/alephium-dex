# Alephium DEX

## Install

```
npm install
```

## Start a local devnet for testing and development

```
npx @alephium/cli devnet start
```

## Deploy dex contracts

```
npx @alephium/cli deploy -n devnet
```

## Create test tokens on devnet

```
npx ts-node scripts/devnet.ts create-tokens -n 5
```

It will create 5 test tokens on devnet

## UI

```
cd ui
npm install
npm run build
npm run start
```

