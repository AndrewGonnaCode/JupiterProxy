import { spawn } from 'child_process';
import { cloneNecessaryAccounts } from '../utils/hooks/clone-accounts';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { readFileSync } from 'fs';

const CPI_SWAP_PROGRAM_ID = new PublicKey('DvNur6pprGPLZHobyxoLxAoKvj8E1YjR83m94HperYwz');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const testWallet = readFileSync('./test-wallet.json', 'utf-8');
const testKepair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(testWallet)));

async function cloneAccountsAndRunTests() {
    try {
        // Get vault address
        const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("vault"),
                WSOL_MINT.toBuffer(),
                USDC_MINT.toBuffer(),
                testKepair.publicKey.toBuffer(),
                new anchor.BN(1000000000).toArrayLike(Buffer, "le", 8),
                new anchor.BN(0).toArrayLike(Buffer, "le", 8),
                new anchor.BN(1779964906).toArrayLike(Buffer, "le", 8)
            ],
            CPI_SWAP_PROGRAM_ID
        );

        console.log('Vault in clone address', vault.toBase58());

        console.log('🔄 Starting account cloning process...');
        console.log(`Using vault address as user: ${vault.toBase58()}`);
        await cloneNecessaryAccounts(vault.toBase58());
        
        console.log('✅ Accounts cloned successfully, starting tests...');
        
        // Run anchor test
        const testProcess = spawn('anchor', ['test'], {
            stdio: 'inherit',
            shell: true
        });

        return new Promise((resolve, reject) => {
            testProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Tests completed successfully');
                    resolve(true);
                } else {
                    console.error(`❌ Tests failed with code ${code}`);
                    reject(new Error(`Tests failed with code ${code}`));
                }
            });

            testProcess.on('error', (err) => {
                console.error('❌ Failed to start test process:', err);
                reject(err);
            });
        });
    } catch (error) {
        console.error('❌ Error during test process:', error);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    cloneAccountsAndRunTests()
        .catch(console.error)
        .finally(() => process.exit());
}

export { cloneAccountsAndRunTests }; 