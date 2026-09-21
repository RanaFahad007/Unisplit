import { app, connectDatabase } from "../server.js";

let ready;

export default async function handler(req, res) {
  if (!ready) {
    ready = connectDatabase().catch((error) => {
      ready = null;
      throw error;
    });
  }

  try {
    await ready;
    return app(req, res);
  } catch (error) {
    console.error("API initialization error:", error);
    return res.status(500).json({ message: "Database connection failed." });
  }
}
