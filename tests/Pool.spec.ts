import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell } from '@ton/core';
import { Pool } from '../wrappers/Pool';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Pool', () => {
    let code: Cell;
    beforeAll(async () => {
        code = await compile('Pool');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let pool: SandboxContract<Pool>;
    beforeEach(async () => {
    });
});
