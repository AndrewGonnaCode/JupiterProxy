import * as fs from 'fs';
import * as path from 'path';
import { PublicKey, AddressLookupTableAccount } from '@solana/web3.js';

interface SwapCache {
    quote: any;
    swapData: any;
    accounts: string[];
    lookupTables?: AddressLookupTableAccount[];
}

const CACHE_FILE = path.join(__dirname, '../../.cache/swap-cache.json');

/**
 * Custom JSON serializer that handles BigInt values
 */
function customJSONStringify(obj: any): string {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        if (value instanceof PublicKey) {
            return value.toBase58();
        }
        return value;
    }, 2);
}

/**
 * Custom JSON parser that handles BigInt strings
 */
function customJSONParse(str: string): any {
    return JSON.parse(str, (key, value) => {
        if (typeof value === 'string' && /^\d+n$/.test(value)) {
            return BigInt(value.slice(0, -1));
        }
        return value;
    });
}

/**
 * Saves swap data to cache
 */
export function saveSwapCache(quote: any, swapData: any, accounts: string[], lookupTables?: AddressLookupTableAccount[]): void {
    const cache: SwapCache = {
        quote,
        swapData,
        accounts,
        lookupTables
    };
    
    // Ensure cache directory exists
    const cacheDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    fs.writeFileSync(CACHE_FILE, customJSONStringify(cache));
}

/**
 * Reads swap data from cache if it exists
 */
export function readSwapCache(): SwapCache | null {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            return null;
        }

        const data = fs.readFileSync(CACHE_FILE, 'utf8');
        const cache = customJSONParse(data);
        
        // Convert lookup tables back to AddressLookupTableAccount objects
        if (cache.lookupTables) {
            cache.lookupTables = cache.lookupTables.map((lt: any) => {
                // Ensure we have a proper PublicKey object
                const key = typeof lt.key === 'string' ? new PublicKey(lt.key) : lt.key;
                
                // Ensure addresses in state are PublicKey objects
                const addresses = lt.state.addresses.map((addr: any) => 
                    typeof addr === 'string' ? new PublicKey(addr) : addr
                );

                return new AddressLookupTableAccount({
                    key,
                    state: {
                        ...lt.state,
                        addresses
                    }
                });
            });
        }

        console.log('Using cached swap data');
        return cache;
    } catch (error) {
        console.error('Error reading cache:', error);
        return null;
    }
}

/**
 * Clears the swap cache
 */
export function clearSwapCache(): void {
    if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE);
    }
} 