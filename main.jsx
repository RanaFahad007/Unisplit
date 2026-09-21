import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = "/api";
const GROUP_KEY = "unisplit.groupId";
const USER_KEY = "unisplit.userId";

function readLocal(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

function App() {
  const [groupId, setGroupId] = useState(readLocal(GROUP_KEY));
  const [currentUserId, setCurrentUserId] = useState(readLocal(USER_KEY));
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (id = groupId) => {
    if (!id) return;
    setBusy(true);
    try {
      const response = await fetch(`${API}/group/${encodeURIComponent(id)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load group.");
      setData(result);
    } catch (error) {
      setMessage(error.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (groupId) load(groupId);
  }, [groupId]);

  const enter = (id, userId) => {
    localStorage.setItem(GROUP_KEY, id);
    if (userId) localStorage.setItem(USER_KEY, userId);
    setGroupId(id);
    if (userId) setCurrentUserId(userId);
    setMessage("");
  };

  const leave = () => {
    localStorage.removeItem(GROUP_KEY);
    localStorage.removeItem(USER_KEY);
    setGroupId("");
    setCurrentUserId("");
    setData(null);
    setMessage("");
  };

  if (!groupId) {
    return <StartScreen onEnter={enter} message={message} setMessage={setMessage} />;
  }

  if (!data) {
    return <div className="center">{busy ? "Loading UniSplit…" : message || "Connecting…"}</div>;
  }

  const currentUser = data.users.find((u) => u.userId === currentUserId);
  if (!currentUserId || !currentUser) {
    return (
      <IdentityScreen
        data={data}
        onSelect={(id) => enter(data.group.groupId, id)}
        onLeave={leave}
      />
    );
  }

  return (
    <Dashboard
      data={data}
      currentUserId={currentUserId}
      reload={() => load(groupId)}
      onLeave={leave}
      message={message}
      setMessage={setMessage}
    />
  );
}

function StartScreen({ onEnter, message, setMessage }) {
  const [name, setName] = useState("Fahad");
  const [email, setEmail] = useState("");
  const [groupName, setGroupName] = useState("University Friends");
  const [joinId, setJoinId] = useState("");
  const [joining, setJoining] = useState(false);

  const create = async (event) => {
    event.preventDefault();
    setJoining(true);
    try {
      const response = await fetch(`${API}/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, groupName })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not create group.");
      onEnter(result.groupId, result.userId);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setJoining(false);
    }
  };

  const join = async (event) => {
    event.preventDefault();
    if (!joinId.trim()) return;
    setJoining(true);
    try {
      const response = await fetch(`${API}/group/${encodeURIComponent(joinId.trim())}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Group not found.");
      if (!result.users.length) throw new Error("This group has no participants.");
      onEnter(result.group.groupId, result.users[0].userId);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="landing">
      <section className="card hero">
        <Brand />
        <h2>Start your expense group</h2>
        <p>Create a fresh group with only you as the first member, or join a group shared by a friend.</p>

        <form onSubmit={create}>
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
          <label>Email <span className="muted">(optional)</span></label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          <label>Group name</label>
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} required />
          <button disabled={joining}>{joining ? "Creating…" : "Create New Group"}</button>
        </form>

        <div className="divider">OR</div>

        <form onSubmit={join}>
          <label>Group ID</label>
          <input value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="e.g. UNI-AB12CD34" />
          <button className="secondary" disabled={joining}>Join Existing Group</button>
        </form>

        <p className="msg">{message}</p>
      </section>
    </div>
  );
}

function IdentityScreen({ data, onSelect, onLeave }) {
  const [selected, setSelected] = useState(data.users[0]?.userId || "");

  return (
    <div className="landing">
      <section className="card hero">
        <Brand />
        <h2>Who are you?</h2>
        <p>Select your participant profile so UniSplit knows which payments belong to you.</p>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {data.users.map((user) => <option key={user.userId} value={user.userId}>{user.name}</option>)}
        </select>
        <button onClick={() => onSelect(selected)}>Continue as {data.users.find((u) => u.userId === selected)?.name}</button>
        <button className="secondary" onClick={onLeave}>Leave Group</button>
      </section>
    </div>
  );
}

function Dashboard({ data, currentUserId, reload, onLeave, message, setMessage }) {
  const [showMember, setShowMember] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);

  const name = (id) => data.users.find((u) => u.userId === id)?.name || "Unknown";
  const total = data.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const youOwe = data.payments.filter((p) => p.from === currentUserId).reduce((sum, p) => sum + Number(p.remaining || 0), 0);
  const receive = data.payments.filter((p) => p.to === currentUserId).reduce((sum, p) => sum + Number(p.remaining || 0), 0);
  const pending = data.payments.filter((p) => p.status !== "paid").length;

  return (
    <main>
      <header>
        <Brand />
        <div className="header-actions">
          <span className="group-chip">{data.group.name} · {data.group.groupId}</span>
          <button className="secondary small" onClick={onLeave}>Switch Group</button>
        </div>
      </header>

      <div className="stats">
        <Card value={`Rs. ${total.toLocaleString()}`} label="Total Expenses" />
        <Card value={`Rs. ${youOwe.toLocaleString()}`} label="You Owe" />
        <Card value={`Rs. ${receive.toLocaleString()}`} label="You Should Receive" />
        <Card value={pending} label="Pending Payments" />
      </div>

      <div className="actions">
        <button onClick={() => setShowExpense(!showExpense)}>+ Add Expense</button>
        <button onClick={() => setShowMember(!showMember)} className="secondary">+ Participant</button>
        <button onClick={() => setShowSettlement(!showSettlement)} className="secondary">Record Settlement</button>
      </div>

      {showMember && <AddMember groupId={data.group.groupId} reload={reload} setMessage={setMessage} />}
      {showExpense && (
        <AddExpense
          data={data}
          currentUserId={currentUserId}
          reload={reload}
          setMessage={setMessage}
        />
      )}
      {showSettlement && (
        <SettlementForm
          data={data}
          currentUserId={currentUserId}
          reload={reload}
          setMessage={setMessage}
        />
      )}

      <section className="card">
        <div className="section-head">
          <h2>Participants</h2>
          <span>{data.users.length} members</span>
        </div>
        {data.users.map((user) => (
          <div className="row" key={user.userId}>
            <div><b>{user.name}</b><span>{user.email || "No email"}</span></div>
            <span>{user.userId === currentUserId ? "You" : "Member"}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Expense History</h2>
          <span>{data.expenses.length} expenses</span>
        </div>
        {data.expenses.length === 0 ? (
          <Empty text="No expenses yet. Add your first group expense." />
        ) : data.expenses.map((expense) => (
          <div className="row" key={expense.expenseId}>
            <div>
              <b>{expense.title}</b>
              <span>{expense.date} · Paid by {name(expense.paidBy)} · Split between {expense.members.length}</span>
            </div>
            <strong>Rs. {Number(expense.amount).toLocaleString()}</strong>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Who Owes Whom</h2>
          <span>Live balance</span>
        </div>
        {data.payments.length === 0 ? (
          <Empty text="No outstanding payments." />
        ) : data.payments.map((payment) => (
          <PaymentRow
            key={payment.paymentId}
            payment={payment}
            name={name}
            currentUserId={currentUserId}
            reload={reload}
            setMessage={setMessage}
          />
        ))}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Settlement History</h2>
          <span>{data.settlements.length} recorded</span>
        </div>
        {data.settlements.length === 0 ? (
          <Empty text="No settlements recorded." />
        ) : data.settlements.map((item) => (
          <div className="row" key={item.settlementId}>
            <div>
              <b>{name(item.from)} → {name(item.to)}</b>
              <span>{item.date}</span>
            </div>
            <strong>Rs. {Number(item.amount).toLocaleString()}</strong>
          </div>
        ))}
      </section>

      <p className="msg page-message">{message}</p>
    </main>
  );
}

function AddMember({ groupId, reload, setMessage }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not add participant.");
      setName(""); setEmail("");
      setMessage("Participant added.");
      await reload();
    } catch (error) { setMessage(error.message); }
  };

  return (
    <section className="card">
      <h2>Add Participant</h2>
      <form className="grid3" onSubmit={submit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" />
        <button>Add Member</button>
      </form>
    </section>
  );
}

function AddExpense({ data, currentUserId, reload, setMessage }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [selected, setSelected] = useState(data.users.map((u) => u.userId));

  const submit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: data.group.groupId,
          title,
          amount: Number(amount),
          date,
          paidBy,
          memberIds: selected
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not save expense.");
      setTitle(""); setAmount("");
      setMessage("Expense saved.");
      await reload();
    } catch (error) { setMessage(error.message); }
  };

  const toggle = (id) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <section className="card">
      <h2>Add Expense</h2>
      <form onSubmit={submit}>
        <div className="grid3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Expense title" required />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Amount PKR" required />
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" required />
        </div>
        <label>Paid by</label>
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {data.users.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
        </select>
        <div className="checks">
          <b>Split equally among</b>
          {data.users.map((u) => (
            <label key={u.userId}>
              <input type="checkbox" checked={selected.includes(u.userId)} onChange={() => toggle(u.userId)} />
              {u.name}
            </label>
          ))}
        </div>
        <button>Save Expense</button>
      </form>
    </section>
  );
}

function PaymentRow({ payment, name, currentUserId, reload, setMessage }) {
  const [amount, setAmount] = useState(payment.amount || 0);
  const [proof, setProof] = useState("");
  const totalShare = Number(payment.amount || 0) + Number(payment.remaining || 0);

  const upload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 3_500_000) {
      setMessage("Please choose a receipt image under about 3.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProof(String(reader.result));
    reader.readAsDataURL(file);
  };

  const update = async () => {
    try {
      const response = await fetch(`${API}/payments/${payment.paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), proofData: proof })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not update payment.");
      setMessage("Payment updated.");
      await reload();
    } catch (error) { setMessage(error.message); }
  };

  return (
    <div className="payment">
      <div className="row">
        <div><b>{name(payment.from)} → {name(payment.to)}</b><span>Share Rs. {totalShare.toLocaleString()} · Remaining Rs. {Number(payment.remaining).toLocaleString()}</span></div>
        <Status status={payment.status} />
      </div>

      {payment.status !== "paid" && (
        <div className="paybox">
          <input
            type="number"
            min="0"
            max={totalShare}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={payment.from !== currentUserId}
          />
          <input type="file" accept="image/*" onChange={upload} disabled={payment.from !== currentUserId} />
          <button onClick={update} disabled={payment.from !== currentUserId}>Update Payment</button>
        </div>
      )}

      {payment.proofData && (
        <a className="proof" href={payment.proofData} target="_blank" rel="noreferrer">View payment proof</a>
      )}
    </div>
  );
}

function SettlementForm({ data, currentUserId, reload, setMessage }) {
  const [to, setTo] = useState(data.users.find((u) => u.userId !== currentUserId)?.userId || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const submit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: data.group.groupId,
          from: currentUserId,
          to,
          amount: Number(amount),
          date
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not record settlement.");
      setAmount("");
      setMessage("Settlement recorded.");
      await reload();
    } catch (error) { setMessage(error.message); }
  };

  return (
    <section className="card">
      <h2>Record Settlement</h2>
      <form className="grid3" onSubmit={submit}>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {data.users.filter((u) => u.userId !== currentUserId).map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
        </select>
        <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount PKR" required />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <button>Save Settlement</button>
      </form>
    </section>
  );
}

function Status({ status }) {
  return <em className={`status ${status}`}>{status}</em>;
}

function Empty({ text }) {
  return <p className="empty">{text}</p>;
}

function Card({ value, label }) {
  return <div className="card stat"><b>{value}</b><span>{label}</span></div>;
}

function Brand() {
  return (
    <div className="brand">
      <div className="logo">U</div>
      <div><h1>UniSplit</h1><p>University Group Expense Manager</p></div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
