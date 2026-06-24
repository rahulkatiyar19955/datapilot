import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Button,
  Card,
  Panel,
  Input,
  Pill,
  SectionHeader,
  Tabs,
  Tab,
  Toggle,
  SeverityDot,
  StatusDot,
  Sparkline,
} from "./index";

describe("Button", () => {
  it("renders children and defaults to type=button", () => {
    render(<Button>Run</Button>);
    const btn = screen.getByRole("button", { name: "Run" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("type", "button");
    // default variant applies only the base `.btn` class
    expect(btn).toHaveClass("btn");
  });

  it("honours an explicit type override (e.g. submit in a form)", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("applies cva variant/size/icon classes", () => {
    render(
      <Button variant="primary" size="sm" icon>
        Go
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn).toHaveClass("btn", "primary", "sm", "icon");
  });

  it("merges a caller-supplied className", () => {
    render(<Button className="custom-x">Hi</Button>);
    expect(screen.getByRole("button", { name: "Hi" })).toHaveClass(
      "btn",
      "custom-x",
    );
  });

  it("fires onClick when enabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole("button", { name: "Click" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Click
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Click" });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards its ref to the underlying <button>", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  // issue #49 — an icon-only Button must expose an accessible name. When the
  // caller supplies a `title` (the common tooltip pattern) but no children or
  // explicit aria-label, the Button derives `aria-label` from `title` so the
  // icon button is reachable by assistive tech.
  it("icon-only Button derives aria-label from title when none is given (issue #49)", () => {
    render(<Button icon title="Refresh" data-testid="icon-only" />);
    const btn = screen.getByTestId("icon-only");
    expect(btn).toHaveClass("icon");
    expect(btn).toHaveAttribute("aria-label", "Refresh");
    // queryable by its accessible name
    expect(
      screen.getByRole("button", { name: "Refresh" }),
    ).toBeInTheDocument();
  });

  it("does not override an explicit aria-label with title (issue #49)", () => {
    render(<Button icon aria-label="Close" title="tooltip" />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("can be given an aria-label by the caller for icon-only usage", () => {
    render(<Button icon aria-label="Close" />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("renders children inside a .card surface", () => {
    render(<Card>card body</Card>);
    const el = screen.getByText("card body");
    expect(el).toHaveClass("card");
  });

  it("merges className and forwards ref + attributes", () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <Card ref={ref} className="extra" data-testid="c">
        x
      </Card>,
    );
    const el = screen.getByTestId("c");
    expect(el).toHaveClass("card", "extra");
    expect(ref.current).toBe(el);
  });
});

describe("Panel", () => {
  it("renders children inside a .panel surface", () => {
    render(<Panel>panel body</Panel>);
    expect(screen.getByText("panel body")).toHaveClass("panel");
  });

  it("merges className", () => {
    render(
      <Panel className="extra" data-testid="p">
        x
      </Panel>,
    );
    expect(screen.getByTestId("p")).toHaveClass("panel", "extra");
  });
});

describe("Input", () => {
  it("renders a native input that accepts typing", async () => {
    const user = userEvent.setup();
    render(<Input placeholder="Search" />);
    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "rosbag");
    expect(input).toHaveValue("rosbag");
  });

  it("renders leading and trailing slots", () => {
    render(
      <Input
        leading={<span data-testid="lead">L</span>}
        trailing={<span data-testid="trail">⌘K</span>}
        placeholder="q"
      />,
    );
    expect(screen.getByTestId("lead")).toBeInTheDocument();
    expect(screen.getByTestId("trail")).toBeInTheDocument();
  });

  it("applies the .input wrapper class and forwards className to the wrapper", () => {
    render(<Input className="w-full" placeholder="q" />);
    const input = screen.getByPlaceholderText("q");
    const wrapper = input.parentElement as HTMLElement;
    expect(wrapper).toHaveClass("input", "w-full");
  });

  it("applies inputClassName to the inner <input>", () => {
    render(<Input inputClassName="mono" placeholder="q" />);
    expect(screen.getByPlaceholderText("q")).toHaveClass("mono");
  });

  it("forwards ref to the inner <input> so callers can focus it", () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} placeholder="q" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    ref.current?.focus();
    expect(screen.getByPlaceholderText("q")).toHaveFocus();
  });

  it("size=sm tightens the wrapper with inline geometry", () => {
    render(<Input size="sm" placeholder="q" />);
    const wrapper = screen.getByPlaceholderText("q").parentElement as HTMLElement;
    expect(wrapper).toHaveStyle({ height: "26px" });
  });
});

describe("Pill", () => {
  it("renders as a static <span> when no onClick is supplied", () => {
    render(<Pill>v1.2.3</Pill>);
    const el = screen.getByText("v1.2.3");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveClass("pill");
    // not a button
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders as a <button> when onClick is provided and fires it", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Pill onClick={onClick}>clickable</Pill>);
    const btn = screen.getByRole("button", { name: "clickable" });
    expect(btn).toHaveClass("pill");
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stays a <span> when onClick is explicitly undefined", () => {
    render(<Pill onClick={undefined}>still-static</Pill>);
    expect(screen.getByText("still-static").tagName).toBe("SPAN");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("applies tone and size variant classes", () => {
    render(
      <Pill tone="danger" size="sm">
        crit
      </Pill>,
    );
    expect(screen.getByText("crit")).toHaveClass("pill", "danger", "sm");
  });

  it("adds the mono class and renders a swatch when requested", () => {
    render(
      <Pill mono swatch>
        /path
      </Pill>,
    );
    const el = screen.getByText("/path");
    expect(el).toHaveClass("pill", "mono");
    expect(el.querySelector(".swatch")).not.toBeNull();
  });
});

describe("SectionHeader", () => {
  it("renders an uppercase tracked label with the .section-h class", () => {
    render(<SectionHeader>Robots</SectionHeader>);
    const el = screen.getByText("Robots");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveClass("section-h");
  });
});

describe("Tabs / Tab", () => {
  it("renders a tablist containing tabs", () => {
    render(
      <Tabs>
        <Tab>Timeline</Tab>
        <Tab>Metrics</Tab>
      </Tabs>,
    );
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("marks the active tab via aria-selected and the active class", () => {
    render(
      <Tabs>
        <Tab active>Timeline</Tab>
        <Tab>Metrics</Tab>
      </Tabs>,
    );
    const active = screen.getByRole("tab", { name: "Timeline" });
    const inactive = screen.getByRole("tab", { name: "Metrics" });
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active).toHaveClass("tab", "active");
    expect(inactive).toHaveAttribute("aria-selected", "false");
    expect(inactive).not.toHaveClass("active");
  });

  it("renders a numeric count badge when count is provided", () => {
    render(
      <Tabs>
        <Tab count={5}>Logs</Tab>
      </Tabs>,
    );
    const tab = screen.getByRole("tab", { name: /Logs/ });
    const badge = tab.querySelector(".count");
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent("5");
  });

  it("omits the count badge when count is null", () => {
    render(
      <Tabs>
        <Tab count={null}>Logs</Tab>
      </Tabs>,
    );
    expect(
      screen.getByRole("tab", { name: "Logs" }).querySelector(".count"),
    ).toBeNull();
  });

  it("fires onClick when a tab is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Tabs>
        <Tab onClick={onClick}>Map</Tab>
      </Tabs>,
    );
    await user.click(screen.getByRole("tab", { name: "Map" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Toggle", () => {
  it("renders a switch reflecting its on state via aria-checked", () => {
    render(<Toggle on={true} onChange={() => {}} label="Dark mode" />);
    const sw = screen.getByRole("switch", { name: "Dark mode" });
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("reflects the off state", () => {
    render(<Toggle on={false} onChange={() => {}} label="Dark mode" />);
    expect(screen.getByRole("switch", { name: "Dark mode" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("calls onChange with the negated value when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Toggle on={false} onChange={onChange} label="Stream" />);
    await user.click(screen.getByRole("switch", { name: "Stream" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not call onChange when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Toggle on={false} onChange={onChange} label="Stream" disabled />,
    );
    const sw = screen.getByRole("switch", { name: "Stream" });
    expect(sw).toBeDisabled();
    await user.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SeverityDot", () => {
  it("renders the severity name as its label by default", () => {
    render(<SeverityDot sev="critical" />);
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("renders a custom label override", () => {
    render(<SeverityDot sev="warning" label="Degraded" />);
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.queryByText("warning")).toBeNull();
  });

  it("maps severity to the matching Pill tone (info -> accent)", () => {
    render(<SeverityDot sev="info" label="note" />);
    expect(screen.getByText("note")).toHaveClass("pill", "accent", "sm");
  });

  it("maps success -> ok tone and renders a swatch", () => {
    render(<SeverityDot sev="success" />);
    const el = screen.getByText("success");
    expect(el).toHaveClass("pill", "ok");
    expect(el.querySelector(".swatch")).not.toBeNull();
  });
});

describe("StatusDot", () => {
  it("renders a decorative (aria-hidden) dot", () => {
    const { container } = render(<StatusDot status="ok" />);
    const dot = container.firstElementChild as HTMLElement;
    expect(dot.tagName).toBe("SPAN");
    expect(dot).toHaveAttribute("aria-hidden");
  });

  it("applies the pulse class only when pulse is set", () => {
    const { container: a } = render(<StatusDot status="critical" pulse />);
    expect(a.firstElementChild).toHaveClass("pulse");
    const { container: b } = render(<StatusDot status="critical" />);
    expect(b.firstElementChild).not.toHaveClass("pulse");
  });

  it("renders no glow box-shadow for offline status", () => {
    const { container } = render(<StatusDot status="offline" />);
    expect(container.firstElementChild).toHaveStyle({ boxShadow: "none" });
  });
});

describe("Sparkline", () => {
  it("renders a decorative svg with a default (stable) path", () => {
    const { container } = render(<Sparkline />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden");
    const path = svg?.querySelector("path");
    expect(path?.getAttribute("d")).toContain("M 0 12");
  });

  it("renders the path shape matching the requested trend", () => {
    const { container } = render(<Sparkline trend="spike" />);
    const d = container.querySelector("path")?.getAttribute("d");
    expect(d).toContain("L 14 4");
  });

  it("honours custom width/height and stroke color", () => {
    const { container } = render(
      <Sparkline width={80} height={30} color="red" />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg).toHaveAttribute("width", "80");
    expect(svg).toHaveAttribute("height", "30");
    expect(svg.querySelector("path")).toHaveAttribute("stroke", "red");
  });
});
