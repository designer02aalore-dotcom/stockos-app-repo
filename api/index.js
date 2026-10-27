import server from "../dist/server/server.js";

export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

export default async function handler(req, res) {
  try {
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const fullUrl = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        } else {
          headers.set(key, String(value));
        }
      }
    }

    const init = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      if (req.body) {
        if (Buffer.isBuffer(req.body)) {
          init.body = req.body;
        } else if (typeof req.body === "string") {
          init.body = Buffer.from(req.body);
        } else {
          init.body = Buffer.from(JSON.stringify(req.body));
        }
      } else {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        if (chunks.length > 0) {
          init.body = Buffer.concat(chunks);
        }
      }
    }

    const webRequest = new Request(fullUrl, init);
    const webResponse = await server.fetch(webRequest);

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((val, key) => {
      // Don't set content-encoding if raw buffer is sent
      if (key.toLowerCase() !== "content-encoding") {
        res.setHeader(key, val);
      }
    });

    const arrayBuffer = await webResponse.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("Vercel Serverless Function Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end(`Internal Server Error: ${error?.message || error}`);
  }
}
