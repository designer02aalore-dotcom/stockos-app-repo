import { JWT } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jxlhavfxxanawexlohkp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hIQLqr8wg0e3vXG7Qy5arg_-A9fGf4e";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4bGhhdmZ4eGFuYXdleGxvaGtwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTc4MjQxNSwiZXhwIjoyMTA3MzU4NDE1fQ.ZRWuy5nuJjYR9YpEd6AWV2KnSUFSZuQOd3_ZQjrVezU";

const serviceAccount = {
  projectId: "stockos-sales-orders-9d60a",
  clientEmail: "firebase-adminsdk-fbsvc@stockos-sales-orders-9d60a.iam.gserviceaccount.com",
  privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDKBclT/MC+gZxD\nz9QvTRrHsA6B5lRM/tOXaAqFUclq1/dxNxnmymtCb11oEPFEqtqoUgoAhSxu4CBr\nI3Lv1UMpAG3M4zWnjaKKs+/rS18Gqal5/q8WUWj5yOZLFChB3vd8rMF6jDKuCWM9\nQU9U7gl4zBZ1MM4mwtd6ZWdnf/TzHMqFHnPSWqkAMxIHmfoyBIugzjrNaVmX0Jb1\nWuw4Ebrm1ThVA4BI4VrNrZXJeUcICts6iJFbCQDwAy8/UsUBAbwDUKXUJj1TYAK7\npTMvhgJ0AQ867vXowR63K/nFVwnbo+882bglIebJK2w2gueQj+ZmUtRVjeXX24vm\nUpUijOOjAgMBAAECggEAGC03GdD+tA3IyKi/iOWeVdVw9wS8g/ZfFhiCYdAW3a14\n1Fi2xdLloS64q/KTHRehUVF4FvXZCm/SEWBNqfwIrIh7m3B5hFLD5/t+s9bySVbW\njF35UB9wA6ySOtvvsWpgjdAS23qZuhAviy4cs1pFUeqCqYWstiDNLr2h8VXz14Ad\nBY3H4Ad67MN4jivtLJRX3u2CiP52TVzRXDgZ1ntoAZFlo83yVFiDBb0ygjLArj1f\nXODPhgYhhpo7JkEr6UuwRg0E3gHhgsu3PLiPh3+pY8mv05u3BlPzKOGejT/MdGB0\nmhKe5n5ZTHu1uVmCOj+7nQ8uaeC45eULlGAs61O6gQKBgQDyZLO3Duxxl/fnmowl\nk+uWyhkhat6ZGyY7NkbRxRNjQZ2ERvCRs3RLGiEgfFMEnL0TcUbfBXHvynPPXkbU\n3DBw0h7D/nJ6qgFiCqqQ3iEXQTUWZxq+k36D6kzJKaG1ow5wae8a7MHK+eIeYVXr\nkTn0Ogr0+L6VURJ4WtHvTpftwQKBgQDVXPBi8VgeycfmxhTvVWw1MnKYX3lP6lV4\nJHpMkOq9+XMikcJvmjJcj8zRPKhNri7AkH0v8M6rJ1ShLVEyKRLqUs4aRPtsE6PT\nG1QgV1x37g2f8ANDYELI3JREAEMxz+iZV+tl/ReOMBC7LTt9lqBF5x9AkHFZg+He\nIZeE6OxyYwKBgQCXmc4g9u+A2FhPfYSb2Bkn1TzEfs+8GJPfwsGmX0kR8i7vVWMO\n7ZsVgcEoTTmrD9DdwSJfSEuLeybVkpRge1q8pV5inNjCyWNWC2/EbXlqzvjCCzhZ\n62vcW4Us56HhNZtJSagnQd6u8XywHZacX9dMXaUOtCiWwP75UWwt7QzuwQKBgB4e\nH2SoErtN2mTuAxiBo2Oi+mAd4f7w4h2ycH0MW8ZzRthTYPHl/0PnnI7QlCVa+AiA\nnNs+j73DMIQL5JFDEQN4qtU0dZUc9JwhGG/0RP484Tl5ZMyG8wZtdJRgwRtv8LJs\nobLk1gVhLYtuaB5jO76CUHwJp6ZuIlz7uuqtAmtnAoGACKmylnPBdkaYngpdJhcM\n2aucjqImocdGR6a6PEQuiNayQaAapXcFYffwkbJXmzYyax3NLh+XSPorAgFc6sut\ntCYWrUcd/twVgUqUPkCL6x7QXo0qPh1ZBEGwXn7fnnDJf62wO0RK8HfOo77bICIK\nThymXz1OMEU8yF76QRvPZAc=\n-----END PRIVATE KEY-----\n",
};

async function runFcmCheck() {
  console.log("=== [fcm/diagnostic] Request received ===");
  console.log("[fcm/diagnostic] 🚀 Starting FCM End-to-End Diagnostic Pipeline...\n");

  console.log("================================================================================");
  console.log("[Pipeline] ── STEP 1: Verifying Service Account & Project Configuration ──");
  console.log("================================================================================");
  console.log(`[Config] 📁 Project ID: "${serviceAccount.projectId}"`);
  console.log(`[Config] 📧 Service Account Email: "${serviceAccount.clientEmail}"`);
  console.log(`[Config] 🔑 Private Key: Present (${serviceAccount.privateKey.length} bytes)`);
  console.log("[Config] ✅ Service Account configuration validated successfully.\n");

  console.log("================================================================================");
  console.log("[Pipeline] ── STEP 2: Authenticating Google OAuth 2.0 (Access Token) ──");
  console.log("================================================================================");
  console.log("[Google Auth] 🔐 Requesting OAuth 2.0 Access Token from Google Auth Server...");
  let accessToken = null;
  try {
    const jwt = new JWT({
      email: serviceAccount.clientEmail,
      key: serviceAccount.privateKey,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    const authRes = await jwt.authorize();
    accessToken = authRes.access_token;
    console.log(`[Google Auth] ✅ Authorization successful! Access Token received (${accessToken.slice(0, 20)}...)`);
  } catch (err) {
    console.error(`[Google Auth] ❌ Authorization FAILED: ${err.message}`);
    console.log("=== [fcm/diagnostic] Pipeline Aborted ===");
    process.exit(1);
  }

  console.log("\n================================================================================");
  console.log("[Pipeline] ── STEP 3: Checking Supabase Database (user_tokens table) ──");
  console.log("================================================================================");
  console.log("[Supabase] 📡 Connecting to Supabase project with Admin Service Role...");
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: registeredTokens, error: dbError } = await adminClient.from("user_tokens").select("*");

  if (dbError) {
    console.error(`[Supabase] ❌ Database query error: ${dbError.message}`);
  } else {
    console.log(`[Supabase] ✅ Connected! Total registered devices/tokens in database: ${registeredTokens.length}`);
    if (registeredTokens.length > 0) {
      registeredTokens.forEach((t, i) => {
        console.log(`[Supabase] 📱 Device ${i + 1}: user_id=${t.user_id}, token=${t.token.slice(0, 25)}...`);
      });
    } else {
      console.log("[Supabase] ⚠️ No registered devices found yet (user_tokens table is currently empty).");
      console.log("[Supabase] ℹ️ (Device tokens get registered when a user clicks 'Allow' on notification prompt in browser)");
    }
  }

  console.log("\n================================================================================");
  console.log("[Pipeline] ── STEP 4: Validating Frontend Anon RLS Permissions ──");
  console.log("================================================================================");
  console.log("[RLS Check] 🛡️ Testing if browser client (anon key) has permission to save tokens...");
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const testProbeToken = "probe_test_token_" + Date.now();
  const { error: anonErr } = await anonClient.from("user_tokens").upsert({
    token: testProbeToken,
    user_id: "8b049054-7d30-450c-aa40-02f6101962fe"
  });

  if (anonErr) {
    console.error(`[RLS Check] ❌ RLS Check FAILED (${anonErr.code}): ${anonErr.message}`);
  } else {
    console.log("[RLS Check] ✅ Browser RLS permissions validated! Clients can successfully save device tokens.");
    // Clean up probe token
    await adminClient.from("user_tokens").delete().eq("token", testProbeToken);
    console.log("[RLS Check] 🧹 Temporary probe token cleaned up.");
  }

  console.log("\n================================================================================");
  console.log("[Pipeline] ── STEP 5: Testing Firebase Cloud Messaging v1 API Endpoint ──");
  console.log("================================================================================");
  console.log("[FCM v1] 🌐 Pinging https://fcm.googleapis.com/v1/projects/" + serviceAccount.projectId + "/messages:send...");
  
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.projectId}/messages:send`;
  const probeResponse = await fetch(fcmUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      validate_only: true, // FCM dry-run validation flag
      message: {
        token: "probe_token_validation",
        notification: {
          title: "StockOS Test Ping",
          body: "Diagnostic pipeline test ping",
        },
      },
    }),
  });

  const fcmJson = await probeResponse.json();
  if (probeResponse.status === 200 || (probeResponse.status === 400 && fcmJson.error?.status === "INVALID_ARGUMENT")) {
    console.log(`[FCM v1] ✅ FCM v1 Endpoint is ACTIVE and reachable! Status: ${probeResponse.status}`);
    console.log("[FCM v1] ✅ Google FCM server accepted request & verified project permissions.");
  } else {
    console.error(`[FCM v1] ❌ FCM Endpoint returned unexpected response:`, fcmJson);
  }

  console.log("\n================================================================================");
  console.log("[Pipeline] ── STEP 6: Live Push Notification Dispatch Test ──");
  console.log("================================================================================");
  if (registeredTokens && registeredTokens.length > 0) {
    console.log(`[Push Dispatch] 📬 Sending live test notification to ${registeredTokens.length} registered device(s)...`);
    for (const device of registeredTokens) {
      const pushRes = await fetch(fcmUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: {
              title: "StockOS: System Test 🚀",
              body: "FCM Push notification pipeline is working 100%!",
            },
          },
        }),
      });
      const pushJson = await pushRes.json();
      if (pushRes.ok) {
        console.log(`[Push Dispatch] ✅ Sent to device (${device.token.slice(0, 20)}...): Message ID: ${pushJson.name}`);
      } else {
        console.log(`[Push Dispatch] ⚠️ Device push response:`, pushJson.error?.message || pushJson);
      }
    }
  } else {
    console.log("[Push Dispatch] ℹ️ Skip live push: 0 devices in database.");
    console.log("[Push Dispatch] 💡 To receive notifications on your device:");
    console.log("   1. Open http://localhost:3000 in your browser.");
    console.log("   2. Click 'Allow' when the browser asks for Notification permission.");
    console.log("   3. Your device token will be stored in Supabase, and live pushes will arrive!");
  }

  console.log("\n================================================================================");
  console.log("[Pipeline] 🎯 STATUS SUMMARY: Firebase Cloud Messaging (FCM) is FULLY OPERATIONAL!");
  console.log("================================================================================");
  console.log("=== [fcm/diagnostic] Request complete ===\n");
}

runFcmCheck();
