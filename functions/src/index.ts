// Import v2 http functions and v2 params
import { https } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

import * as admin from "firebase-admin";
import * as crypto from "crypto";

admin.initializeApp();
const db = admin.firestore();

const paystackSecret = defineSecret("PAYSTACK_SECRET_KEY");

export const paystackWebhook = https.onRequest(
  { secrets: [paystackSecret] },
  async (request, response) => {
    // 1. --- VERIFY THE REQUEST IS FROM PAYSTACK ---
    const signature = request.headers["x-paystack-signature"] as string;
    if (!signature) {
      console.error("No Paystack signature in header");
      response.status(400).send("Bad Request: Missing signature");
      return;
    }

    try {
      const hash = crypto
        .createHmac("sha512", paystackSecret.value())
        .update(JSON.stringify(request.body))
        .digest("hex");

      if (hash !== signature) {
        console.error("Invalid Paystack signature");
        response.status(401).send("Unauthorized: Invalid signature");
        return;
      }
    } catch (error) {
      console.error("Error verifying signature:", error);
      response.status(500).send("Internal Server Error");
      return;
    }

    // 2. --- SIGNATURE IS VALID, PROCESS THE EVENT ---
    const event = request.body.event;
    const data = request.body.data;

    console.log(`Received Paystack event: ${event}`);

    switch (event) {
      case "charge.success":
        console.log(`Payment successful for reference: ${data.reference}`);

        // --- NEW: Read metadata sent from the frontend ---
        const { userId, durationDays, planName } = data.metadata;
        const userEmail = data.customer.email;

        // Validate that we have the necessary info
        if (!userId || !durationDays) {
          console.error(`CRITICAL: Missing userId or durationDays in payment metadata for email: ${userEmail}. Ref: ${data.reference}`);
          break; // Exit switch case, but still send 200 OK to Paystack
        }

        try {
          // Directly get the user document using their UID
          const userDocRef = db.collection("users").doc(userId);

          // Calculate the expiry date
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + parseInt(durationDays, 10));

          // --- NEW: Update Firestore with the expiry date ---
          await userDocRef.update({
            isPremiumUser: true, // Keep this for quick checks if needed
            premiumExpiryDate: admin.firestore.Timestamp.fromDate(expiryDate), // The source of truth!
            lastPaymentRef: data.reference,
            lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
            currentPlan: planName || "Unknown", // Store the plan name
          });

          console.log(`Successfully granted premium access to ${userEmail} (${userId}) until ${expiryDate.toISOString()}`);
        } catch (error) {
          console.error(`Error updating Firestore for userId: ${userId}`, error);
        }
        break;

      case "charge.failed":
        console.log(`Payment failed for ${data.customer.email}: ${data.gateway_response}`);
        break;

      default:
        console.log(`Unhandled event type: ${event}`);
    }

    // 3. --- SEND A 200 OK RESPONSE to Paystack ---
    response.status(200).send("Event received successfully.");
  }
);