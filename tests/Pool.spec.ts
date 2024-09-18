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

    // These were estimated from the 'should allow to ... send jettons' and
    // 'should get its balance changed by no less than its ton_balance' tests.
    // For some reason, setting fee_process_jetton_swap_tx doesn't allow to reduce sendJetton_estimatedForwardAmount;
    // however, we add the incoming value to what is send to user, so this is not an extra fee.
    const sendJetton_estimatedForwardAmount = 3_000_000n;
    const sendJetton_estimatedValue = 42_000_000n + sendJetton_estimatedForwardAmount;

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
    let nonDeployer: SandboxContract<TreasuryContract>;
    let poolContract: SandboxContract<Pool>;
    let minterContract: SandboxContract<JettonMinter>;
    let poolJettonWalletAddress: Address;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        nonDeployer = await blockchain.treasury('nonDeployer');

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
                adminAddress: null, // i.e. same as deployer
                jettonTotalSupply: initPoolJettonBalance * 20n / 19n,
                jettonAuthorAddress: deployer.address,
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

    it('should get its balance changed by no less than its ton_balance', async () => {
        const sendAmount = 1000_000_000n;
        const poolBalanceBefore = await poolContract.getBalance();
        const poolVirtualTonBalanceBefore = await poolContract.getVirtualTonBalance();

        const buyResult = await poolContract.sendBuyJetton(deployer.getSender(), sendAmount);

        const poolBalanceAfter = await poolContract.getBalance();
        const poolVirtualTonBalanceAfter = await poolContract.getVirtualTonBalance();
        const expectedFee = await poolContract.getBuyJettonFixedFee();

        expect(poolBalanceAfter - poolBalanceBefore)
            .toBeGreaterThanOrEqual(poolVirtualTonBalanceAfter - poolVirtualTonBalanceBefore);
        // TODO: move this into a separate test or rename this one (~tests getBuyJettonFixedFee~)
        expect(poolBalanceAfter - poolBalanceBefore).toBeGreaterThanOrEqual(sendAmount - expectedFee);

        // same for selling
        const walletCreatedEvent = buyResult.events.find(e => e.type === 'account_created');
        expect(walletCreatedEvent).toBeTruthy();
        const deployerJettonWalletAddress = (walletCreatedEvent as { account: Address }).account;
        expect(Address.isAddress(deployerJettonWalletAddress)).toBeTruthy();
        const deployerJettonWallet = JettonWallet.createFromAddress(deployerJettonWalletAddress);
        const deployerJettonWalletContract = blockchain.openContract(deployerJettonWallet);

        const poolBalanceBeforeSell = poolBalanceAfter;
        const poolVirtualTonBalanceBeforeSell = await poolContract.getVirtualTonBalance();
        const sendJettonAmount = await deployerJettonWalletContract.getJettonBalance();

        const sellResult = await deployerJettonWalletContract.sendTransfer(deployer.getSender(),
            sendJetton_estimatedValue,
            sendJettonAmount, poolContract.address,
            deployer.address,
            null, sendJetton_estimatedForwardAmount, null
        );
        expect(sellResult.transactions).not.toHaveTransaction({ success: false });

        const poolBalanceAfterSell = await poolContract.getBalance();
        const poolVirtualTonBalanceAfterSell = await poolContract.getVirtualTonBalance();

        expect(poolBalanceAfterSell - poolBalanceBeforeSell)
            .toBeGreaterThanOrEqual(poolVirtualTonBalanceAfterSell - poolVirtualTonBalanceBeforeSell);
    });

    it('should return correct exchange estimations', async () => {
        const T0 = jettonMinPrice * initPoolJettonBalance;
        // amountFactor and partFactor are arbitrary, may use random instead
        const amountFactor = 100n;
        const tonAmountToSwap = amountFactor * jettonMinPrice;
        const estimatedJettonAmount = await poolContract.getEstimatedJettonForTon(tonAmountToSwap);

        expect(estimatedJettonAmount).toBeLessThan(amountFactor);
        const effectiveTonAmount = tonAmountToSwap - tonAmountToSwap * BigInt(feePerMille) / 1000n;
        expect(estimatedJettonAmount).toEqual(effectiveTonAmount * initPoolJettonBalance / (T0 + effectiveTonAmount));

        await poolContract.sendBuyJetton(deployer.getSender(), tonAmountToSwap);

        const newJettonBalance = await poolContract.getVirtualJettonBalance();
        const newTonBalance = await poolContract.getVirtualTonBalance();
        // due to tx fees, estimatedJettonAmount is less than what the user really gets
        expect(newJettonBalance).toBeGreaterThan(initPoolJettonBalance - estimatedJettonAmount);
        expect(newTonBalance).toBeLessThan(tonAmountToSwap);

        const partFactor = 2n;
        const userBalance = initPoolJettonBalance - newJettonBalance;
        const jettonAmountToSwap = userBalance / partFactor;
        const estimatedTonAmount = await poolContract.getEstimatedTonForJetton(jettonAmountToSwap);

        expect(estimatedTonAmount).toBeLessThan(tonAmountToSwap / partFactor);
        const expectedSwapTonAmount = jettonAmountToSwap * (newTonBalance + T0) / (newJettonBalance + jettonAmountToSwap);
        const effectiveSwapTonAmount = expectedSwapTonAmount - expectedSwapTonAmount * BigInt(feePerMille) / 1000n;
        // JS rounding of / 1000n doesn't always round up, which we do in the contract
        expect(estimatedTonAmount).toBeLessThanOrEqual(effectiveSwapTonAmount);
        expect(estimatedTonAmount).toBeGreaterThanOrEqual(effectiveSwapTonAmount - 1n);
    });

    it('should allow admin to collect funds', async () => {
        // ensure pool has some TON
        const additionalAmount = 2_000_000_000n;
        await deployer.send({
            to: poolContract.address,
            value: additionalAmount,
        });
        expect(await poolContract.getBalance()).toBeGreaterThanOrEqual(additionalAmount);

        const desiredAmount = additionalAmount / 10n;
        const estimatedCollectFee = await poolContract.getCollectFeeUpperEstimation();
        const amountToRequest = desiredAmount + estimatedCollectFee;

        const deployerBalanceBefore = await deployer.getBalance();
        const collectResult = await poolContract.sendCollectFunds(deployer.getSender(), amountToRequest);
        const deployerBalanceAfter = await deployer.getBalance();
        expect(collectResult.transactions).not.toHaveTransaction({ success: false });
        expect(deployerBalanceAfter - deployerBalanceBefore).toBeGreaterThanOrEqual(desiredAmount);
    });

    it('should allow admin to collect almost all funds and keep balance consistent', async () => {
        const collectableAmount = await poolContract.getCollectableFundsAmount();
        const desiredAmount = collectableAmount;
        const estimatedCollectFee = await poolContract.getCollectFeeUpperEstimation();
        const amountToRequest = desiredAmount + estimatedCollectFee;

        const deployerBalanceBefore = await deployer.getBalance();
        const collectResult = await poolContract.sendCollectFunds(deployer.getSender(), amountToRequest);
        const deployerBalanceAfter = await deployer.getBalance();
        expect(collectResult.transactions).not.toHaveTransaction({ success: false });
        expect(deployerBalanceAfter - deployerBalanceBefore).toBeGreaterThanOrEqual(desiredAmount);

        // virtual balance should remain consistent
        const contractBalance = await poolContract.getBalance();
        const contractVirtualTonBalance = await poolContract.getVirtualTonBalance();
        expect(contractBalance).toBeGreaterThanOrEqual(contractVirtualTonBalance);
    });

    it('should not allow non-admin to collect funds', async () => {
        const collectableAmount = await poolContract.getCollectableFundsAmount();
        const desiredAmount = collectableAmount;
        const estimatedCollectFee = await poolContract.getCollectFeeUpperEstimation();
        const amountToRequest = desiredAmount + estimatedCollectFee;

        const collectResult = await poolContract.sendCollectFunds(nonDeployer.getSender(), amountToRequest);
        expect(collectResult.transactions).toHaveTransaction({ success: false });
    });
});
