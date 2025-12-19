import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
// import * as myExtension from '../../extension';

suite("Extension Activation", () => {
  test("Extension should activate", async () => {
    const extension = vscode.extensions.getExtension("ambivcestudio.code-word");

    assert.ok(extension, "Extension not found");

    await extension!.activate();

    assert.strictEqual(extension!.isActive, true);
  });

  test("Meditation mode can be set", async () => {
    const config = vscode.workspace.getConfiguration("CodeWord");

    await config.update(
      "mode",
      "Meditation",
      vscode.ConfigurationTarget.Global
    );

    const mode = config.get("mode");
    assert.strictEqual(mode, "Meditation");
  });

  test("Command is registered", async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(
      commands.includes("code-word.unsheath"),
      "Command not registered"
    );
  });

  test("Command executes without error", async () => {
    try {
      vscode.commands.executeCommand("code-word.unsheath");
      assert.ok(true);
    } catch (err) {
      assert.fail("Command threw an error");
    }
  });
});
