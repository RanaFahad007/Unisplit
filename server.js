import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import crypto from "crypto";

const app = express();

app.use(cors());
app.use(express.json({ limit: "12mb" }));

const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      userId: { type: String, unique: true, index: true },
      name: { type: String, required: true, trim: true },
      email: { type: String, default: "", trim: true }
    },
    { timestamps: true }
  ),
  "users"
);

const Group = mongoose.model(
  "Group",
  new mongoose.Schema(
    {
      groupId: { type: String, unique: true, index: true },
      name: { type: String, required: true, trim: true },
      memberIds: { type: [String], default: [] }
    },
    { timestamps: true }
  ),
  "groups"
);

const Expense = mongoose.model(
  "Expense",
  new mongoose.Schema(
    {
      expenseId: { type: String, unique: true, index: true },
      groupId: { type: String, index: true },
      title: { type: String, required: true, trim: true },
      amount: { type: Number, required: true, min: 0.01 },
      currency: { type: String, default: "PKR" },
      paidBy: { type: String, required: true },
      date: { type: String, required: true },
      splitType: { type: String, default: "equal" },
      members: [
        {
          userId: String,
          share: Number
        }
      ]
    },
    { timestamps: true }
  ),
  "expenses"
);

const Payment = mongoose.model(
  "Payment",
  new mongoose.Schema(
    {
      paymentId: { type: String, unique: true, index: true },
      expenseId: { type: String, index: true },
      groupId: { type: String, index: true },
      from: String,
      to: String,
      amount: { type: Number, default: 0 },
      remaining: { type: Number, default: 0 },
      status: { type: String, enum: ["pending", "partial", "paid"], default: "pending" },
      proofData: { type: String, default: "" },
      paidAt: Date
    },
    { timestamps: true }
  ),
  "payments"
);

const Settlement = mongoose.model(
  "Settlement",
  new mongoose.Schema(
    {
      settlementId: { type: String, unique: true, index: true },
      groupId: { type: String, index: true },
      from: String,
      to: String,
      amount: Number,
      proofData: { type: String, default: "" },
      date: String
    },
    { timestamps: true }
  ),
  "settlements"
);

let dbPromise;

export function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (dbPromise) return dbPromise;

  if (!process.env.MONGODB_URI) {
    return Promise.reject(new Error("MONGODB_URI is not configured."));
  }

  dbPromise = mongoose.connect(process.env.MONGODB_URI).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function clean(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function groupCode() {
  return `UNI-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function getGroupPayload(groupId) {
  const group = await Group.findOne({ groupId }).lean();
  if (!group) return null;

  const [users, expenses, payments, settlements] = await Promise.all([
    User.find({ userId: { $in: group.memberIds } }).sort({ createdAt: 1 }).lean(),
    Expense.find({ groupId }).sort({ date: -1, createdAt: -1 }).lean(),
    Payment.find({ groupId }).sort({ createdAt: -1 }).lean(),
    Settlement.find({ groupId }).sort({ date: -1, createdAt: -1 }).lean()
  ]);

  return { group, users, expenses, payments, settlements };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// Creates a clean group. The only initial member is Fahad.
app.post("/api/bootstrap", async (req, res) => {
  try {
    const name = clean(req.body.name || "Fahad", 80) || "Fahad";
    const email = clean(req.body.email, 160);
    const groupName = clean(req.body.groupName || "University Friends", 100) || "University Friends";

    const userId = makeId("user");
    const groupId = groupCode();

    await User.create({ userId, name, email });
    await Group.create({ groupId, name: groupName, memberIds: [userId] });

    res.status(201).json({ userId, groupId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/group/:id", async (req, res) => {
  try {
    const payload = await getGroupPayload(clean(req.params.id, 100));
    if (!payload) return res.status(404).json({ message: "Group not found." });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/groups/:id/members", async (req, res) => {
  try {
    const groupId = clean(req.params.id, 100);
    const group = await Group.findOne({ groupId });
    if (!group) return res.status(404).json({ message: "Group not found." });

    const name = clean(req.body.name, 80);
    const email = clean(req.body.email, 160);

    if (!name) return res.status(400).json({ message: "Participant name is required." });

    const user = await User.create({
      userId: makeId("user"),
      name,
      email
    });

    group.memberIds.push(user.userId);
    await group.save();

    res.status(201).json({ userId: user.userId, name: user.name, email: user.email });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/expenses", async (req, res) => {
  try {
    const groupId = clean(req.body.groupId, 100);
    const title = clean(req.body.title, 120);
    const amount = Number(req.body.amount);
    const paidBy = clean(req.body.paidBy, 100);
    const date = clean(req.body.date, 20);
    const memberIds = Array.isArray(req.body.memberIds)
      ? [...new Set(req.body.memberIds.map((x) => clean(x, 100)).filter(Boolean))]
      : [];

    if (!groupId || !title || !Number.isFinite(amount) || amount <= 0 || !paidBy || !date || !memberIds.length) {
      return res.status(400).json({ message: "Title, amount, date, payer and members are required." });
    }

    const group = await Group.findOne({ groupId }).lean();
    if (!group) return res.status(404).json({ message: "Group not found." });

    const validMembers = memberIds.filter((id) => group.memberIds.includes(id));
    if (!validMembers.length || !validMembers.includes(paidBy)) {
      return res.status(400).json({ message: "Invalid group member selection." });
    }

    const share = Math.round((amount / validMembers.length) * 100) / 100;

    const expense = await Expense.create({
      expenseId: makeId("expense"),
      groupId,
      title,
      amount: Math.round(amount * 100) / 100,
      paidBy,
      date,
      splitType: "equal",
      members: validMembers.map((userId, index) => {
        const base = Math.round(share * 100) / 100;
        const totalBase = base * validMembers.length;
        const corrected = index === validMembers.length - 1
          ? Math.round((amount - totalBase + base) * 100) / 100
          : base;
        return { userId, share: corrected };
      })
    });

    const others = expense.members.filter((m) => m.userId !== paidBy);

    if (others.length) {
      await Payment.insertMany(
        others.map((member) => ({
          paymentId: makeId("payment"),
          expenseId: expense.expenseId,
          groupId,
          from: member.userId,
          to: paidBy,
          amount: 0,
          remaining: member.share,
          status: "pending"
        }))
      );
    }

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.patch("/api/payments/:id", async (req, res) => {
  try {
    const payment = await Payment.findOne({ paymentId: clean(req.params.id, 150) });
    if (!payment) return res.status(404).json({ message: "Payment not found." });

    const expense = await Expense.findOne({ expenseId: payment.expenseId }).lean();
    if (!expense) return res.status(404).json({ message: "Expense not found." });

    const member = expense.members.find((m) => m.userId === payment.from);
    const share = Number(member?.share || 0);

    let amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 0) amount = 0;
    amount = Math.min(amount, share);

    payment.amount = Math.round(amount * 100) / 100;
    payment.remaining = Math.round((share - amount) * 100) / 100;
    payment.status = payment.remaining === 0 ? "paid" : amount > 0 ? "partial" : "pending";

    if (typeof req.body.proofData === "string") {
      // Keep receipt screenshots reasonably small for MongoDB storage.
      if (req.body.proofData.length > 5_000_000) {
        return res.status(400).json({ message: "Receipt image is too large. Use an image under about 3–4 MB." });
      }
      payment.proofData = req.body.proofData;
    }

    if (amount > 0) payment.paidAt = new Date();
    await payment.save();

    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/settlements", async (req, res) => {
  try {
    const groupId = clean(req.body.groupId, 100);
    const from = clean(req.body.from, 100);
    const to = clean(req.body.to, 100);
    const amount = Number(req.body.amount);
    const date = clean(req.body.date, 20);
    const proofData = typeof req.body.proofData === "string" ? req.body.proofData : "";

    if (!groupId || !from || !to || from === to || !Number.isFinite(amount) || amount <= 0 || !date) {
      return res.status(400).json({ message: "Valid settlement details are required." });
    }

    const group = await Group.findOne({ groupId }).lean();
    if (!group || !group.memberIds.includes(from) || !group.memberIds.includes(to)) {
      return res.status(400).json({ message: "Both settlement members must belong to the group." });
    }

    const settlement = await Settlement.create({
      settlementId: makeId("settlement"),
      groupId,
      from,
      to,
      amount: Math.round(amount * 100) / 100,
      proofData: proofData.slice(0, 5_000_000),
      date
    });

    res.status(201).json(settlement);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ message: "API route not found." });
});

export { app };
