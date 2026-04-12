import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge component", () => {
  it("renders children text", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders with default variant", () => {
    render(<Badge>Default</Badge>);
    const el = screen.getByText("Default");
    expect(el).toBeInTheDocument();
    // Default variant includes bg-primary
    expect(el.className).toContain("bg-primary");
  });

  it("renders with destructive variant", () => {
    render(<Badge variant="destructive">Error</Badge>);
    const el = screen.getByText("Error");
    expect(el.className).toContain("bg-destructive");
  });

  it("merges custom className", () => {
    render(<Badge className="my-custom-class">Custom</Badge>);
    const el = screen.getByText("Custom");
    expect(el.className).toContain("my-custom-class");
  });

  it("passes through HTML attributes", () => {
    render(<Badge data-testid="my-badge">Test</Badge>);
    expect(screen.getByTestId("my-badge")).toBeInTheDocument();
  });
});
