import "dotenv/config";
import axios from "axios";
import crypto from "crypto";

const merchantId = process.env.PHONE_PAY_MERCHANT_ID;
const saltKey = process.env.SALT_KEY;
const saltIndex = process.env.PHONE_PAY_KEY_INDEX;

console.log("merchantId:", merchantId, "| index:", saltIndex, "| salt:", saltKey ? "loaded" : "MISSING");

async function checkStatus(txnId) {
  const path = `/pg/v1/status/${merchantId}/${txnId}`;
  const checksum =
    crypto.createHash("sha256").update(path + saltKey).digest("hex") +
    "###" + saltIndex;

  const { data } = await axios.get("https://api.phonepe.com/apis/hermes" + path, {
    headers: {
      "Content-Type": "application/json",
      "X-VERIFY": checksum,
      "X-MERCHANT-ID": merchantId,
    },
  });
  return data;
}

checkStatus(process.argv[2])
  .then((r) => {
    console.log("Code:", r.code); // PAYMENT_SUCCESS, PAYMENT_ERROR, PAYMENT_PENDING
    console.log("Amount: ₹", r.data?.amount / 100);
    console.log(JSON.stringify(r, null, 2));
  })
  .catch((e) => console.error(e.response?.data || e.message));