import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, Address } from '@ton/core';
import { Pool } from '../wrappers/Pool';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Pool', () => {
    const initPoolJettonBalance = 1000_000n;
    const jettonMinPrice = 1000_000n;
    const feePerMille = 5;
    const jettonMinterContent = {
        type: 1,
        uri: 'https://github.com/YakovL/ton-example-jetton/raw/master/jetton-metadata.json',
    } as Parameters<typeof JettonMinter.jettonContentToCell>[0];

    // these were estimated from the 'should allow to ... send jettons' test
    const sendJetton_estimatedValue = 45_000_000n;
    const sendJetton_estimatedForwardAmount = 2_000_000n;

    let code: Cell;
    let minterCode: Cell;
    let walletCode: Cell;
    beforeAll(async () => {
        code = await compile('Pool');
        minterCode = await compile('JettonMinter');
        walletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let poolContract: SandboxContract<Pool>;
    let minterContract: SandboxContract<JettonMinter>;
    let poolJettonWalletAddress: Address;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        const minter = JettonMinter.createFromConfig({
            admin: deployer.address,
            content: JettonMinter.jettonContentToCell(jettonMinterContent),
            wallet_code: walletCode,
        }, minterCode);
        minterContract = blockchain.openContract(minter);

        const deployMinterResult = await minterContract.sendDeploy(
            deployer.getSender(),
            minter.estimatedDeployGasPrice
        );
        const pool = Pool.createFromConfig({
            poolJettonContent: JettonMinter.jettonContentToCell(jettonMinterContent)
        }, code);
        poolContract = blockchain.openContract(pool);

        const mintResult = await minterContract.sendMint(
            deployer.getSender(),
            poolContract.address, initPoolJettonBalance,
            50_000_000n, // TODO: estimate and set correct forward_ton_amount
            60_000_000n  // TODO: estimate and set correct total_ton_amount
        );
        const walletCreatedEvent = mintResult.events.find(e => e.type === 'account_created');
        expect(walletCreatedEvent).toBeTruthy();
        poolJettonWalletAddress = (walletCreatedEvent as { account: Address }).account;
        expect(Address.isAddress(poolJettonWalletAddress)).toBeTruthy();

        const deployResult = await poolContract.sendDeploy(
            deployer.getSender(),
            pool.estimatedDeployGasPrice,
            {
                poolJettonBalance: initPoolJettonBalance,
                minimalPrice: jettonMinPrice,
                feePerMille,
                factoryAddress: deployer.address,      // should be factory address in case of deployment by factory
                jettonWalletAddress: poolJettonWalletAddress,
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: poolContract.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and pool are ready to use
    });

    it('should allow to buy and sell jettons', async () => {
        const sendAmount = 1000_000_000n;
        const buyResult = await poolContract.sendBuyJetton(deployer.getSender(), sendAmount);

        const walletCreatedEvent = buyResult.events.find(e => e.type === 'account_created');
        expect(walletCreatedEvent).toBeTruthy();
        const deployerJettonWalletAddress = (walletCreatedEvent as { account: Address }).account;
        expect(Address.isAddress(deployerJettonWalletAddress)).toBeTruthy();
        const deployerJettonWallet = JettonWallet.createFromAddress(deployerJettonWalletAddress);

        const deployerJettonWalletContract = blockchain.openContract(deployerJettonWallet);
        const deployerJettonBalance = await deployerJettonWalletContract.getJettonBalance();
        const expectedConstFee = await poolContract.getBuyJettonFixedFee();
        const expectedPercentFee = sendAmount * BigInt(feePerMille) / 1000n;
        const expectedEffectiveTonAmout = sendAmount - expectedConstFee - expectedPercentFee;
        // in fact, for such a small buy we get exactly  expectedEffectiveTonAmout / jettonMinPrice
        expect(deployerJettonBalance).toBeGreaterThan(expectedEffectiveTonAmout / jettonMinPrice / 2n);
        expect(deployerJettonBalance).toBeLessThanOrEqual(expectedEffectiveTonAmout / jettonMinPrice);

        // == sell ==
        const deployerBalanceBeforeSell = await deployer.getBalance();

        const sendJettonAmount = deployerJettonBalance;
        const sellResult = await deployerJettonWalletContract.sendTransfer(deployer.getSender(),
            sendJetton_estimatedValue,
            sendJettonAmount,
            poolContract.address,   // to
            deployer.address,       // response address
            null,                   // custom payload
            sendJetton_estimatedForwardAmount,
            null                    // forward payload
        );
        expect(sellResult.transactions).not.toHaveTransaction({ success: false });

        const deployerBalanceAfterSell = await deployer.getBalance();
        const deployerJettonBalanceAfterSell = await deployerJettonWalletContract.getJettonBalance();

        expect(deployerJettonBalanceAfterSell).toEqual(0n);
        expect(deployerBalanceAfterSell - deployerBalanceBeforeSell - sendJetton_estimatedValue).toBeGreaterThan(0n);
    });

    it('should sell jettons by increasing price', async () => {
        const sendAmount = 1000_000_000n;
        const firstBuyResult = await poolContract.sendBuyJetton(deployer.getSender(), sendAmount);

        const walletCreatedEvent = firstBuyResult.events.find(e => e.type === 'account_created');
        const deployerJettonWalletAddress = (walletCreatedEvent as { account: Address }).account;
        const deployerJettonWallet = JettonWallet.createFromAddress(deployerJettonWalletAddress);
        const deployerJettonWalletContract = blockchain.openContract(deployerJettonWallet);
        const balanceAfterFirstBuy = await deployerJettonWalletContract.getJettonBalance();

        await poolContract.sendBuyJetton(deployer.getSender(), sendAmount);
        const balanceAfterSecondBuy = await deployerJettonWalletContract.getJettonBalance();

        expect(balanceAfterSecondBuy - balanceAfterFirstBuy).toBeLessThan(balanceAfterFirstBuy);
    });

    it('should increase its ton_balance by no less than its balance is actually increased, plus fee', async () => {
        const sendAmount = 1000_000_000n;
        const poolBalanceBefore = await poolContract.getBalance();

        await poolContract.sendBuyJetton(deployer.getSender(), sendAmount);

        const poolBalanceAfter = await poolContract.getBalance();
        const expectedFee = await poolContract.getBuyJettonFixedFee();

        expect(poolBalanceAfter - poolBalanceBefore).toBeGreaterThanOrEqual(sendAmount - expectedFee);
    });
});
