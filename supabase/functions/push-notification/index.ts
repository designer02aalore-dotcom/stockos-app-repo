import { createClient } from "npm:@supabase/supabase-js@2";
import { JWT } from "npm:google-auth-library@^10";

// ⚠️ तुमच्या Service Account JSON मधील माहिती इथे टाका
const serviceAccount = {
  projectId: "stockos-sales-orders-9d60a", 
  clientEmail: "firebase-adminsdk-fbsvc@stockos-sales-orders-9d60a.iam.gserviceaccount.com", // तुमचा खरा client_email
  privateKey:  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDKBclT/MC+gZxD\nz9QvTRrHsA6B5lRM/tOXaAqFUclq1/dxNxnmymtCb11oEPFEqtqoUgoAhSxu4CBr\nI3Lv1UMpAG3M4zWnjaKKs+/rS18Gqal5/q8WUWj5yOZLFChB3vd8rMF6jDKuCWM9\nQU9U7gl4zBZ1MM4mwtd6ZWdnf/TzHMqFHnPSWqkAMxIHmfoyBIugzjrNaVmX0Jb1\nWuw4Ebrm1ThVA4BI4VrNrZXJeUcICts6iJFbCQDwAy8/UsUBAbwDUKXUJj1TYAK7\npTMvhgJ0AQ867vXowR63K/nFVwnbo+882bglIebJK2w2gueQj+ZmUtRVjeXX24vm\nUpUijOOjAgMBAAECggEAGC03GdD+tA3IyKi/iOWeVdVw9wS8g/ZfFhiCYdAW3a14\n1Fi2xdLloS64q/KTHRehUVF4FvXZCm/SEWBNqfwIrIh7m3B5hFLD5/t+s9bySVbW\njF35UB9wA6ySOtvvsWpgjdAS23qZuhAviy4cs1pFUeqCqYWstiDNLr2h8VXz14Ad\nBY3H4Ad67MN4jivtLJRX3u2CiP52TVzRXDgZ1ntoAZFlo83yVFiDBb0ygjLArj1f\nXODPhgYhhpo7JkEr6UuwRg0E3gHhgsu3PLiPh3+pY8mv05u3BlPzKOGejT/MdGB0\nmhKe5n5ZTHu1uVmCOj+7nQ8uaeC45eULlGAs61O6gQKBgQDyZLO3Duxxl/fnmowl\nk+uWyhkhat6ZGyY7NkbRxRNjQZ2ERvCRs3RLGiEgfFMEnL0TcUbfBXHvynPPXkbU\n3DBw0h7D/nJ6qgFiCqqQ3iEXQTUWZxq+k36D6kzJKaG1ow5wae8a7MHK+eIeYVXr\nkTn0Ogr0+L6VURJ4WtHvTpftwQKBgQDVXPBi8VgeycfmxhTvVWw1MnKYX3lP6lV4\nJHpMkOq9+XMikcJvmjJcj8zRPKhNri7AkH0v8M6rJ1ShLVEyKRLqUs4aRPtsE6PT\nG1QgV1x37g2f8ANDYELI3JREAEMxz+iZV+tl/ReOMBC7LTt9lqBF5x9AkHFZg+He\nIZeE6OxyYwKBgQCXmc4g9u+A2FhPfYSb2Bkn1TzEfs+8GJPfwsGmX0kR8i7vVWMO\n7ZsVgcEoTTmrD9DdwSJfSEuLeybVkpRge1q8pV5inNjCyWNWC2/EbXlqzvjCCzhZ\n62vcW4Us56HhNZtJSagnQd6u8XywHZacX9dMXaUOtCiWwP75UWwt7QzuwQKBgB4e\nH2SoErtN2mTuAxiBo2Oi+mAd4f7w4h2ycH0MW8ZzRthTYPHl/0PnnI7QlCVa+AiA\nnNs+j73DMIQL5JFDEQN4qtU0dZUc9JwhGG/0RP484Tl5ZMyG8wZtdJRgwRtv8LJs\nobLk1gVhLYtuaB5jO76CUHwJp6ZuIlz7uuqtAmtnAoGACKmylnPBdkaYngpdJhcM\n2aucjqImocdGR6a6PEQuiNayQaAapXcFYffwkbJXmzYyax3NLh+XSPorAgFc6sut\ntCYWrUcd/twVgUqUPkCL6x7QXo0qPh1ZBEGwXn7fnnDJf62wO0RK8HfOo77bICIK\nThymXz1OMEU8yF76QRvPZAc=\n-----END PRIVATE KEY-----\n", // तुमची खरी private_key
};

// FCM टोकन मिळवण्यासाठी Google Auth
async function getAccessToken() {
  const jwtClient = new JWT({
    email: serviceAccount.clientEmail,
    key: serviceAccount.privateKey,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

Deno.serve(async (req) => {
  try {
    // Supabase Webhook कडून येणारा नवीन ऑर्डर डेटा
    const payload = await req.json();
    const newOrder = payload.record; 

    // १. Supabase मधून सर्व FCM टोकन मिळवा
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: tokens } = await supabase.from("user_tokens").select("token");

    if (!tokens || tokens.length === 0) {
      return new Response("No devices registered", { status: 200 });
    }

    const accessToken = await getAccessToken();
    const title = "StockOS: New Order Received! 📬";
    const body = `New order from ${newOrder.customer_name || "Customer"} has been imported.`;

    // २. प्रत्येक टोकनला FCM नोटिफिकेशन पाठवा
    const results = await Promise.all(
      tokens.map(async (t) => {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${serviceAccount.projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: t.token,
                notification: { title, body },
              },
            }),
          }
        );
        return response.json();
      })
    );

    return new Response(JSON.stringify({ success: true, results }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});