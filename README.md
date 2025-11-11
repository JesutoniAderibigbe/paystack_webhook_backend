# Paystack Webhook Firebase Function

## Overview

This project implements a secure, server-side webhook handler for Paystack using **Firebase Cloud Functions (v2)**.

The primary purpose of this function is to securely listen for payment events from Paystack (like `charge.success`) and automatically grant users access to premium content by updating their profiles in Firestore.

It solves a critical security problem: **it verifies that all payment notifications are *actually* from Paystack** before taking action, preventing users from fraudulently granting themselves access.

## 🛡️ Core Security Feature: Signature Verification

This function will not process *any* request unless it can cryptographically verify the `x-paystack-signature` header. It uses an HMAC SHA512 hash, combining the request body with your Paystack Secret Key, to ensure 100% authenticity.

-----

## ⚙️ How It Works (Workflow)

1.  **Paystack Event:** A user completes a payment. Paystack sends a JSON payload (an "event") to this function's public URL.
2.  **Signature Verification:** The function *immediately* stops and calculates a hash of the request body using your stored `PAYSTACK_SECRET_KEY`. It compares this hash to the `x-paystack-signature` in the request header.
      * **If Mismatch:** The function returns a `401 Unauthorized` error. The request is a fake.
      * **If Match:** The request is genuine.
3.  **Event Processing:** The function inspects the `event.type`.
4.  **`charge.success` Logic:**
      * It gets the `customer.email` from the event data.
      * It queries your `users` collection in Firestore to find the user with that email.
      * If found, it updates the user's document (e.g., sets `isPremiumUser: true`).
5.  **200 OK Response:** The function sends a `200 OK` status back to Paystack.
      * **This is critical.** It tells Paystack, "I have successfully received and processed this event. Do not send it again."

-----

## 🚀 Setup and Deployment

### 1\. Prerequisites

  * A Firebase project on the **Blaze (Pay-as-you-go)** plan.
  * A Paystack account with Live/Test secret keys.
  * The [Firebase CLI](https://firebase.google.com/docs/cli) installed (`npm install -g firebase-tools`).

### 2\. Install Dependencies

If you haven't already, navigate to the `functions` directory and install the required packages:

```bash
cd functions
npm install firebase-functions firebase-admin
```

### 3\. Set Your Paystack Secret Key

This function uses Firebase's v2 secret management. **Never hardcode your secret key.**

Run this command from your project's root directory:

```bash
firebase functions:secrets:set PAYSTACK_SECRET_KEY
```

When prompted, paste your **Paystack Secret Key** (e.g., `sk_live_...`). This stores it securely in Google Secret Manager.

### 4\. Deploy the Function

From your project's root directory, run:

```bash
firebase deploy --only functions:paystackWebhook
```

### 5\. Get Your Webhook URL

After deployment, the CLI will output your function's URL. It will look like this:

`Function URL (paystackWebhook(us-central1)): https://paystackwebhook-dqr4h73bbq-uc.a.run.app`

**This is your official webhook URL.**

-----

## 🔗 Final Step: Configure Paystack

1.  Go to your [Paystack Dashboard](https://dashboard.paystack.com/).
2.  Navigate to **Settings** -\> **API Keys & Webhooks**.
3.  In the "Webhook URL" field, paste the **`.a.run.app`** URL you just deployed.
4.  Click **"Save Changes"**.

Your system is now live. All successful payments will automatically trigger your Firebase function, which will securely verify the payment and update your database.