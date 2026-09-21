# UniSplit

UniSplit is a university group expense manager built with React, Vite, Express and MongoDB Atlas.

## Included

- Fresh first-run state: only the person creating a group exists.
- Create multiple groups.
- Join a group with a group ID.
- Select your participant identity.
- Add participants.
- Add expenses with title, amount, date and payer.
- Equal split among selected members.
- Automatic pending/partial/paid payment records.
- Payment amount updates.
- Payment proof screenshot upload stored with the payment record.
- "Who Owes Whom" view.
- Settlement history.
- MongoDB Atlas persistence.
- Vercel serverless API.
- PWA manifest and UniSplit icon.

## Important security note

This version is an MVP for a university project. A group ID is treated as the access key, so anyone who knows a group ID can open that group. For a production public finance product, add proper authentication, authorization and external object storage for receipts.

## Local setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Put your MongoDB Atlas connection string in `MONGODB_URI`.
4. Install dependencies:

```bash
npm install
```

5. Run the API:

```bash
npm run server
```

6. In another terminal run the Vite frontend:

```bash
npm run dev
```

For local Vite development, the frontend expects `/api` on the same origin. Use a Vite proxy if you want frontend and API on different local ports, or serve the production build through the Node server.

## Vercel

Set the Vercel environment variable:

`MONGODB_URI`

Then deploy the project. `vercel.json` configures the Vite build and `/api` serverless function.

## MongoDB

Use a database such as `unisplit` and give the application database user `readWrite` access to that database.

Do not commit `.env` or passwords to GitHub.
