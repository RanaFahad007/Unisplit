import { app, connectDatabase } from "../server.js";

export default async function handler(req, res) {
  try {
    await connectDatabase();
    return app(req, res);
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    return res.status(500).json({
      message: "Database connection failed."
    });
  }
}
