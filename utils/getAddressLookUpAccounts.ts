import { Connection, PublicKey, AddressLookupTableAccount } from '@solana/web3.js';

export async function getAddressLookupTableAccounts(
    connection: Connection,
    addresses: PublicKey[]
  ): Promise<AddressLookupTableAccount[]> {
    const accounts: AddressLookupTableAccount[] = [];
    
    for (const key of addresses) {
      try {
        const account = await connection.getAccountInfo(new PublicKey(key));
        if (account) {
          const addressLookupTableAccount = AddressLookupTableAccount.deserialize(account.data);
          accounts.push(new AddressLookupTableAccount({
            key,
            state: addressLookupTableAccount
          }));
        }
      } catch (error) {
        console.warn(`Failed to fetch lookup table account}:`, error);
      }
    }
    
    return accounts;
  }

  export async function getAddressesLookupAccounts(
    connection: Connection,
    lookupTableAddresses: string[]
  ):Promise<AddressLookupTableAccount[]>{
    const lookupTables: AddressLookupTableAccount[] = [];

     for (const address of lookupTableAddresses) {
       const tableKey = new PublicKey(address);
     
       const res = await connection.getAddressLookupTable(tableKey);
     
       if (res.value) {
         lookupTables.push(res.value);
       } else {
         console.warn(`⚠️ Failed to load ALT: ${address}`);
       }
     }

     return lookupTables;
  }