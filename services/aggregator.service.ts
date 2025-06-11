import axios from "axios";

export default class AggregatorsService {
  public async getQuote(src: string, dst: string, amount: string) {
    let config = {
      headers: {
        Accept: "application/json",
      },
      params: {
        inputMint: src,
        outputMint: dst,
        amount,
        dexes:['Raydium'],
        onlyDirectRoutes:true,
        excludeDexes:'Obric V2,ZeroFi,Lifinity V2,Raydium'
      },
    };
    const requestURL = "https://lite-api.jup.ag/swap/v1/quote";
    try {
      const response = await axios.get(requestURL, config);
      return response.data;
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  public async generateSwapData(from: string, quoteResponse: any) {

    const data  = JSON.stringify({
        userPublicKey:from,
        quoteResponse,
        prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 10000000,
          priorityLevel: "veryHigh",
        },
        },
        dynamicComputeUnitLimit: true,
      });

      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://lite-api.jup.ag/swap/v1/swap',
        headers: { 
          'Content-Type': 'application/json', 
          'Accept': 'application/json'
        },
        data : data
      };

    try {
      const response = await axios.request(config);
      return response.data;
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  public async generateSwapInstructions(from: string, quoteResponse: any) {

    const data  = JSON.stringify({
        userPublicKey:from,
        quoteResponse,
        prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 10000000,
          priorityLevel: "veryHigh",
        },
        },
        dynamicComputeUnitLimit: true,
      });

      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://lite-api.jup.ag/swap/v1/swap-instructions',
        headers: { 
          'Content-Type': 'application/json', 
          'Accept': 'application/json'
        },
        data : data
      };

    try {
      const response = await axios.request(config);
      return response.data;
    } catch (error) {
      console.error(error);
      return error;
    }
  }
}
