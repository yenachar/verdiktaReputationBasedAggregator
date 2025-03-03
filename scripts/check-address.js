// untility for capitalizing address for checksum
const { utils } = require("ethers");
const rawAddress = "0x8e5e40f8f9103168c7d7cf361c6c0fcbcb8b9b2b"; // Change this. Note all lowercase.
const checksummedAddress = utils.getAddress(rawAddress);
console.log("Checksummed address:", checksummedAddress);

