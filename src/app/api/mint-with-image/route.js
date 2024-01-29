const { Web3 } = require("web3");
const axios = require("axios");
import { NextResponse } from "next/server";
// This function can run for a maximum of 5 seconds
export const maxDuration = 200;

// Environment variables
const privateKey = process.env.PRIVATE_KEY;

// Pinata API headers
const headers = {
  pinata_api_key: process.env.PINATA_API_KEY,
  pinata_secret_api_key: process.env.PINATA_API_SECRET,
};

// Initialize Web3 instance with LAOS node provider
const web3 = new Web3("https://rpc.klaos.laosfoundation.io");

// The address of the recipient of the NFT
const toAddress = "0x5d4FF079B104022472C96fa1dA7C193398E7e9be";

// The contract address of a collection in KLAOS owned by the sender
const contractAddress = "0xFFffffFfffffFffffffFFfFe00000000000000D8";

// The URL of the interface ABI, from GitHub
const contractABIUrl =
  "https://github.com/freeverseio/laos/blob/main/ownership-chain/precompile/evolution-collection/contracts/EvolutionCollection.json?raw=true";

// Define the number of assets that need to be minted
const numberOfMints = 1;

async function mintAsset(nonce, tokenURI) {
  try {
    // Fetching the contract ABI
    const response = await axios.get(contractABIUrl);
    const contractABI = response.data;

    // Fetch the chain ID
    const chainId = await web3.eth.getChainId();

    // Instantiating the contract
    const contract = new web3.eth.Contract(contractABI, contractAddress);

    // Generate a random slot number
    const slot = getRandomBigInt(2n ** 96n - 1n);

    // Prepare the mint transaction
    const encodedABI = contract.methods
      .mintWithExternalURI(toAddress, slot, tokenURI)
      .encodeABI();
    const fromAddress =
      web3.eth.accounts.privateKeyToAccount(privateKey).address;
    const transaction = {
      from: fromAddress,
      to: contractAddress,
      data: encodedABI,
      gas: 35000,
      nonce: nonce,
      gasPrice: web3.utils.toWei("0.5", "gwei"), // Set the desired gas price
    };

    // Sign and send the transaction
    const signedTx = await web3.eth.accounts.signTransaction(
      transaction,
      privateKey
    );
    console.log("Transaction sent. Waiting for confirmation...");

    const receipt = await web3.eth.sendSignedTransaction(
      signedTx.rawTransaction
    );
    //blockNumber = await web3.eth.getBlockNumber();
    console.log(
      "Transaction confirmed. Asset minted in block number:",
      receipt.blockNumber
    );

    // Retrieve the token ID from the transaction receipt
    const mintEventABI = contractABI.find(
      (abi) => abi.name === "MintedWithExternalURI" && abi.type === "event"
    );
    const mintEvent = receipt.logs.find(
      (log) => log.address.toLowerCase() === contractAddress.toLowerCase()
    );
    if (mintEvent && mintEventABI) {
      const decodedLog = web3.eth.abi.decodeLog(
        mintEventABI.inputs,
        mintEvent.data,
        mintEvent.topics.slice(1)
      );
      console.log(`Token ID: ${decodedLog._tokenId}`);
      return decodedLog._tokenId;
    } else {
      console.log("Mint event log not found.");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}
// Function to generate a random BigInt for the slot
function getRandomBigInt(max) {
  return (
    BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) ** 2n %
    BigInt(max)
  );
}

async function uploadToIPFS(JSONObj) {
  const pinataContent = {
    pinataContent: JSONObj,
  };
  const pinataHeaders = {
    accept: "application/json",
    "content-type": "application/json",
  };

  try {
    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      pinataContent,
      { headers: { ...headers, pinataHeaders } }
    );
    return response.data.IpfsHash;
  } catch (error) {
    console.error("Error uploading file to IPFS:", error);
    return null;
  }
}

export async function POST(req) {
  if (req.method === "POST") {
    try {
      // Parse request body
      const body = await req.json();
      console.log("inside", body);

      // Call your existing function with the necessary parameters
      // Remember to adjust this part according to your specific needs
      const currentNonce = await web3.eth.getTransactionCount(
        web3.eth.accounts.privateKeyToAccount(privateKey).address
      );
      console.log("currentNonce", currentNonce);
      const NFT = {
        name: body.name,
        description: body.description,
        attributes: body.attributes,
        animation_url: "",
        image: "ipfs://QmULeUxD3NTHMuvpkPeRACWmmYQSHsjsdsSt7PXXqYDvjo",
      };
      const ipfsHash = await uploadToIPFS(NFT);
      const tokenURI = `ipfs://${ipfsHash}`;
      console.log("ipfsHash", tokenURI);
      const asset = await mintAsset(currentNonce, tokenURI);

      // Sending a response back
      return NextResponse.json(
        { success: `Asset minted successfully ${asset}` },
        { status: 200 }
      );
    } catch (error) {
      console.log(error);
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 }
      );
    }
  } else {
    // Handle any requests that aren't POST
    return NextResponse.json(
      { error: "Only POST method allowed" },
      { status: 406 }
    );
  }
}
