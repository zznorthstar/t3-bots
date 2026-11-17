import { BotHqError } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { NewBotAction } from "./NewBotDialog";
import { openNewBot } from "./botCreation";
import { SidebarProvider } from "../ui/sidebar";
import "~/index.css";

const state = vi.hoisted(() => ({
  allowed: true,
  mutate: vi.fn(),
}));
vi.mock("~/state/primaryEnvironment", async (original) => {
  const actual = await original<typeof import("~/state/primaryEnvironment")>();
  const { Atom } = await import("effect/reactivity");
  return { ...actual, primaryEnvironmentIdAtom: Atom.make("local") };
});
vi.mock("~/state/environments", async (original) => ({
  ...(await original<typeof import("~/state/environments")>()),
  useEnvironments: () => ({ environments: [{ environmentId: "local", label: "This PC" }] }),
}));
vi.mock("~/state/botHq", async () => {
  const { Atom } = await import("effect/reactivity");
  const allowed = Atom.make(true);
  const denied = Atom.make(false);
  return { botHq: { mutate: { permissionAtom: () => (state.allowed ? allowed : denied) } } };
});
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => state.mutate }));

function setup() {
  state.allowed = true;
  state.mutate.mockReset();
}

describe("New bot", () => {
  it("opens from the command palette and keeps the instructions when creation fails", async () => {
    setup();
    const Cause = await import("effect/Cause");
    state.mutate.mockResolvedValue({
      _tag: "Failure",
      cause: Cause.fail(new BotHqError({ reason: "unavailable" })),
    });
    await using _screen = await render(
      <SidebarProvider>
        <NewBotAction />
      </SidebarProvider>,
    );
    await act(() => openNewBot());
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Chief of Staff");
    await page.getByRole("textbox", { name: "Role", exact: true }).fill("Project follow-ups");
    await page.getByRole("textbox", { name: "Instructions" }).fill("Ask before sending emails.");
    await page.getByRole("button", { name: "Create bot", exact: true }).click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("The bot runtime is unavailable. Check that it is running, then retry.");
    await expect
      .element(page.getByRole("textbox", { name: "Instructions" }))
      .toHaveValue("Ask before sending emails.");
    expect(state.mutate).toHaveBeenCalledWith({
      environmentId: "local",
      input: {
        _tag: "create",
        name: "Chief of Staff",
        label: "Project follow-ups",
        instructions: "Ask before sending emails.",
      },
    });
    await expect
      .element(page.getByRole("button", { name: "Create bot", exact: true }))
      .toBeEnabled();
  });

  it("prevents creation on a read-only connection", async () => {
    setup();
    state.allowed = false;
    await using screen = await render(
      <SidebarProvider>
        <NewBotAction />
      </SidebarProvider>,
    );
    await screen.getByRole("button", { name: "New bot", exact: true }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Assistant");
    await expect
      .element(page.getByText("This connection does not have permission to create bots."))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Create bot", exact: true }))
      .toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
