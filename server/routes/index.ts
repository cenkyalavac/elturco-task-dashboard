/**
 * Routes Index — composes all domain routers into a single registerRoutes function.
 * Replaces the monolithic routes.ts with modular domain routers.
 *
 * Each router exports an Express Router with routes using relative paths
 * (e.g., "/auth/login" not "/api/auth/login"). This file mounts them
 * under the "/api" prefix.
 */
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "../storage";

// Domain routers
import authRouter from "./auth.router";
import vendorRouter from "./vendor.router";
import quizRouter from "./quiz.router";
import projectRouter from "./project.router";
import financeRouter from "./finance.router";
import qualityRouter from "./quality.router";
import clientRouter from "./client.router";
import portalRouter from "./portal.router";
import integrationRouter from "./integration.router";
import reportingRouter from "./reporting.router";
import adminRouter from "./admin.router";
import vmRouter from "./vm.router";
import pmTeamLeadRouter from "./pm-team-lead.router";

export async function registerRoutes(server: Server, app: Express) {
  // Initialize storage (seed data, run migrations)
  await storage.init();

  // Health check — respond immediately, no async blocking
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Mount all domain routers under /api
  app.use("/api", authRouter);
  app.use("/api", vendorRouter);
  app.use("/api", quizRouter);
  app.use("/api", projectRouter);
  app.use("/api", financeRouter);
  app.use("/api", qualityRouter);
  app.use("/api", clientRouter);
  app.use("/api", portalRouter);
  app.use("/api", integrationRouter);
  app.use("/api", reportingRouter);
  app.use("/api", adminRouter);
  app.use("/api", vmRouter);
  app.use("/api", pmTeamLeadRouter);
}
