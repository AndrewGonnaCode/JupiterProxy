import * as fs from 'fs';
import * as path from 'path';
import { PublicKey, Connection } from '@solana/web3.js';
import AggregatorsService from '../../services/aggregator.service';
import { saveSwapCache, readSwapCache, clearSwapCache } from './swap-cache';
import { AddressLookupTableAccount } from '@solana/web3.js';
import { getAddressLookupTableAccounts } from '../getAddressLookUpAccounts';

// Known AMM program IDs and their names for better documentation
const KNOWN_AMM_PROGRAMS = {
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter Aggregator',
    '4Ec7ZxZS6Sbdg5UGSLHbAnM7GQHp2eFd4KYWRexAipQT': 'Jupiter Executable Data Account',
    'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf': 'Jupiter Aggregator Event Authority'
};

// Token mint addresses that should always be cloned
const REQUIRED_TOKEN_MINTS = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'So11111111111111111111111111111111111111112': 'WSOL',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT'
};

/**
 * Cleans the Anchor.toml file by removing all existing clone entries
 */
function cleanAnchorToml(): void {
    const anchorTomlPath = path.join(__dirname, '..', '..', 'Anchor.toml');
    let anchorToml = fs.readFileSync(anchorTomlPath, 'utf8');
    
    // Remove all existing clone entries
    anchorToml = anchorToml.replace(/\[\[test\.validator\.clone\]\]\naddress = "[^"]+"\n/g, '');
    
    // Remove empty [test.validator] section if it exists
    anchorToml = anchorToml.replace(/\[test\.validator\]\n\n/g, '');
    
    fs.writeFileSync(anchorTomlPath, anchorToml);
}

/**
 * Updates the Anchor.toml file with new clone entries
 */
function updateAnchorToml(accountAddresses: Set<string>): void {
    const anchorTomlPath = path.join(__dirname, '..', '..', 'Anchor.toml');
    let anchorToml = fs.readFileSync(anchorTomlPath, 'utf8');

    // Generate clone entries with comments
    const cloneEntries = Array.from(accountAddresses)
        .map(addr => {
            const comment = KNOWN_AMM_PROGRAMS[addr] || REQUIRED_TOKEN_MINTS[addr] || '';
            return `[[test.validator.clone]]\naddress = "${addr}"${comment ? `  # ${comment}` : ''}\n`;
        })
        .join('\n');

    // Split the file into sections
    const sections = anchorToml.split('\n\n');
    const validatorSectionIndex = sections.findIndex(section => section.startsWith('[test.validator]'));
    
    if (validatorSectionIndex === -1) {
        // If no validator section exists, add it at the end
        anchorToml += `\n[test.validator]\nurl = "https://api.mainnet-beta.solana.com"\n\n${cloneEntries}\n`;
    } else {
        // Extract the validator URL if it exists
        const validatorSection = sections[validatorSectionIndex];
        const urlMatch = validatorSection.match(/url\s*=\s*"[^"]+"/);
        const validatorUrl = urlMatch ? urlMatch[0] : 'url = "https://api.mainnet-beta.solana.com"';
        
        // Replace the validator section with a new one that has the URL first
        sections[validatorSectionIndex] = `[test.validator]\n${validatorUrl}\n\n${cloneEntries}`;
        anchorToml = sections.join('\n\n');
    }

    fs.writeFileSync(anchorTomlPath, anchorToml);
}

/**
 * Verifies if an account exists on mainnet
 */
async function verifyAccountExists(connection: Connection, address: string): Promise<boolean> {
    try {
        const accountInfo = await connection.getAccountInfo(new PublicKey(address));
        return accountInfo !== null;
    } catch (error) {
        console.error(`Error verifying account ${address}:`, error);
        return false;
    }
}

/**
 * Filters out non-existent accounts
 */
async function filterExistingAccounts(connection: Connection, accounts: Set<string>): Promise<Set<string>> {
    const existingAccounts = new Set<string>();
    const accountAddresses = Array.from(accounts);
    
    console.log(`Verifying ${accountAddresses.length} accounts on mainnet...`);
    
    // Process accounts in batches to avoid rate limiting
    const BATCH_SIZE = 10;
    for (let i = 0; i < accountAddresses.length; i += BATCH_SIZE) {
        const batch = accountAddresses.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            batch.map(addr => verifyAccountExists(connection, addr))
        );
        
        batch.forEach((addr, index) => {
            if (results[index]) {
                existingAccounts.add(addr);
            } else {
                console.log(`Account ${addr} does not exist on mainnet, skipping...`);
            }
        });

        // Add delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < accountAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return existingAccounts;
}

/**
 * Gets a quote and swap data, either from cache or from Jupiter API
 */
async function getQuoteAndSwapData(
    aggregatorService: AggregatorsService,
    inputMint: string,
    outputMint: string,
    amount: string,
    userAddress: string,
    connection: Connection
): Promise<{ quote: any; swapData: any; accounts: Set<string>; lookupTables: AddressLookupTableAccount[] }> {
    // Try to get data from cache first
    const cachedData = readSwapCache();
    if (cachedData?.accounts.length > 0) {
        // // Verify lookup tables still exist
        // const lookupTableKeys = cachedData.lookupTables
        const lookupTables = await getAddressLookupTableAccounts(connection, cachedData.swapData.addressLookupTableAddresses);

        console.log("LOOKUP TABLES", lookupTables)
        
            return {
                quote: cachedData.quote,
                swapData: cachedData.swapData,
                accounts: new Set(cachedData.accounts),
                lookupTables: lookupTables
            };
    }

    // If no cache or lookup tables invalid, get fresh data from Jupiter
    console.log(`Getting fresh quote for ${inputMint} -> ${outputMint}...`);
    const quote = await aggregatorService.getQuote(inputMint, outputMint, amount);

    console.log("Quote", quote.routePlan[0].swapInfo);
    
    const swapData = await aggregatorService.generateSwapInstructions(
        userAddress,
        quote
    );

    // Collect all accounts
    const accounts = new Set<string>();
    
    // Add accounts from swap instruction
    swapData.swapInstruction.accounts.forEach(acc => {
        accounts.add(acc.pubkey);
    });

    // Add accounts from setup instructions if any
    if (swapData.setupInstructions) {
        swapData.setupInstructions.forEach(ix => {
            ix.accounts.forEach(acc => accounts.add(acc.pubkey));
        });
    }

    // Add cleanup instruction accounts if any
    if (swapData.cleanupInstruction) {
        swapData.cleanupInstruction.accounts.forEach(acc => {
            accounts.add(acc.pubkey);
        });
    }

    // Fetch and validate lookup tables
    let lookupTables: AddressLookupTableAccount[] = [];
    if (swapData.addressLookupTableAddresses?.length > 0) {
        lookupTables = await getAddressLookupTableAccounts(
            connection,
            swapData.addressLookupTableAddresses
        );
        
        // Add lookup table addresses to accounts set
        swapData.addressLookupTableAddresses.forEach(addr => {
            accounts.add(addr);
        });
    }

    // Save to cache
    saveSwapCache(quote, swapData, Array.from(accounts), lookupTables);

    return { quote, swapData, accounts, lookupTables };
}

/**
 * Hook function to clone necessary accounts before tests run
 * Returns the quote and swap data for use in tests
 */
export async function cloneNecessaryAccounts(userAddress: string): Promise<{ quote: any; swapData: any }> {
    console.log('Starting account gathering process for tests...');
    
    // Clean existing clone entries
    cleanAnchorToml();
    
    // Initialize services
    const aggregatorService = new AggregatorsService();
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Set to store unique account addresses
    const accountAddresses = new Set<string>();
    
    // Add required token mints
    Object.keys(REQUIRED_TOKEN_MINTS).forEach(mint => accountAddresses.add(mint));

    // Add known AMM programs
    Object.keys(KNOWN_AMM_PROGRAMS).forEach(program => accountAddresses.add(program));

    // Get quote and swap data (either from cache or fresh)
    const { quote, swapData, accounts, lookupTables } = await getQuoteAndSwapData(
        aggregatorService,
        'So11111111111111111111111111111111111111112', // WSOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        '1000000000', // 1 WSOL
        userAddress,
        connection
    );

    console.log("Swap Data", swapData);

    // Add all accounts from the quote/swap data
    accounts.forEach(addr => accountAddresses.add(addr));

    // Filter out non-existent accounts
    const existingAccounts = await filterExistingAccounts(connection, accountAddresses);

    // Update Anchor.toml with only existing accounts
    updateAnchorToml(existingAccounts);

    console.log(`Updated Anchor.toml with ${existingAccounts.size} existing accounts to clone`);
    console.log('Please restart your validator for the changes to take effect');

    // Return the quote and swap data for use in tests
    return { quote, swapData };
} 