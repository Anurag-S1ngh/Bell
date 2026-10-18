import { initServices, falkor, knowledge } from "./services";
import cors from "cors";
import express from "express";
import { authToken, rateLimit, requestLogger } from "./middleware";
import { z } from "zod";

import { ENV } from "./env.server";

const app = express();
app.use(
  cors({
    origin: ENV.CORS_ORIGIN || "http://localhost:3001",
    methods: ["GET", "POST", "OPTIONS"],
  }),
);
app.use(express.json());
app.use(requestLogger);
app.use("/api", rateLimit);

const IngestBody = z.object({
  content: z.string().min(1),
  sourceType: z.string().min(1),
  sourceId: z.string().optional(),
  groupId: z.string().optional(),
});

const SearchBody = z.object({
  query: z.string().min(1),
  groupId: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

const AnswerBody = z.object({
  question: z.string().min(1),
  groupId: z.string().optional(),
  trace: z.boolean().optional(),
});

app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/api/health", (_req, res) =>
  res.status(200).json({ status: "ok", service: "bell" }),
);

app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  authToken(req, res, next);
});

app.post("/api/ingest", async (req, res, next) => {
  try {
    const body = IngestBody.parse(req.body);
    const result = await knowledge.ingest(body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/search", async (req, res, next) => {
  try {
    const body = SearchBody.parse(req.body);
    const results = await knowledge.search({
      query: body.query,
      groupId: body.groupId,
      limit: body.limit,
    });
    res.status(200).json(results);
  } catch (error) {
    next(error);
  }
});

app.post("/api/answer", async (req, res, next) => {
  try {
    const body = AnswerBody.parse(req.body);
    const result = await knowledge.answer({
      query: body.question,
      groupId: body.groupId,
      trace: body.trace,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/graph", async (req, res, next) => {
  try {
    const groupId = String(req.query.groupId || ENV.BELL_GROUP_ID);
    const data = await falkor.toVisData(groupId);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(400).json({ error: message });
});

const port = Number(ENV.PORT ?? 3000);
console.log("BOOTING", port, ENV.DATABASE_URL);

initServices()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize services", error);
    process.exit(1);
  });