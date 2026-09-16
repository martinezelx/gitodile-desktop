import { describe, expect, it } from "vitest";
import contract from "../../docs/architecture/025-ipc-contract.json";
import { APP_ERROR_CODES } from "../shared/i18n";

describe("IPC contract snapshot", () => {
  it("keeps command names, arguments, response names, errors and watcher payload stable", () => {
    expect(contract.version).toBe(1);
    expect(contract.commands).toHaveLength(79);
    expect(contract.commands.map((command) => command.name)).toEqual([
      "app_status", "show_main_window", "get_app_update_state", "get_startup_update_confirmation",
      "check_app_update", "download_app_update", "cancel_app_update", "install_app_update",
      "get_app_update_channel", "set_app_update_channel",
      "open_repository", "reveal_project_file", "plan_clone", "clone_repository",
      "cancel_clone", "cleanup_clone", "plan_initialize_project", "initialize_project",
      "cleanup_initialize_project", "read_working_tree_status",
      "read_file_diff", "read_file_image_preview", "read_file_lines", "read_working_tree_diffs",
      "plan_discard_changes",
      "discard_changes", "get_discard_recovery", "list_discard_recoveries",
      "restore_discarded_changes", "delete_discard_recovery", "git_diagnostics",
      "install_git", "update_git", "check_git_update", "get_git_identity",
      "render_diagnostic_report", "save_diagnostic_report", "set_git_identity",
      "get_line_endings", "set_line_endings", "get_default_branch", "set_default_branch",
      "plan_save_version", "save_version", "discover_remotes", "plan_connect_remote",
      "connect_remote", "read_project_remotes", "set_remote_url", "read_project_identity",
      "set_project_identity", "clear_project_identity", "read_ignore_file", "write_ignore_file",
      "read_team_sync_status",
      "check_team_changes", "plan_get_team_changes", "get_team_changes", "list_unpublished_versions",
      "read_commit_file_changes", "read_commit_file_diff", "read_history_page",
      "read_saved_version_detail", "read_saved_version_file_diff", "plan_publish", "publish",
      "get_version_lines", "get_version_line_history", "plan_create_version_line", "create_version_line",
      "plan_switch_version_line", "switch_version_line", "plan_delete_version_line",
      "delete_version_line", "plan_rename_version_line", "rename_version_line",
      "watch_repository", "unwatch_repository", "close_project_session",
    ]);
    expect(contract.commands.find((command) => command.name === "save_version")).toEqual({
      name: "save_version",
      arguments: ["path", "title", "description?", "stateToken", "selectedPaths?", "runHooks", "sessionEpoch"],
      response: "SaveVersionResult",
    });
    for (const commandName of [
      "read_working_tree_status", "read_file_diff", "read_file_image_preview", "read_file_lines",
      "read_working_tree_diffs",
      "discover_remotes", "list_unpublished_versions", "read_commit_file_changes",
      "read_commit_file_diff", "get_version_lines", "get_version_line_history",
      "watch_repository", "unwatch_repository",
      "close_project_session",
      "plan_save_version", "save_version", "read_team_sync_status", "check_team_changes",
      "plan_connect_remote", "connect_remote",
      "read_project_remotes", "set_remote_url", "read_project_identity", "set_project_identity",
      "clear_project_identity", "read_ignore_file", "write_ignore_file",
      "plan_get_team_changes", "get_team_changes",
      "plan_publish", "publish",
      "plan_create_version_line", "create_version_line", "plan_switch_version_line",
      "switch_version_line", "plan_delete_version_line", "delete_version_line",
      "plan_rename_version_line", "rename_version_line",
      "plan_discard_changes", "discard_changes", "get_discard_recovery", "list_discard_recoveries",
      "restore_discarded_changes", "delete_discard_recovery",
      "read_history_page", "read_saved_version_detail", "read_saved_version_file_diff",
    ]) {
      const command = contract.commands.find(({ name }) => name === commandName);
      expect(command?.arguments, commandName).toContain("sessionEpoch");
      expect(command?.arguments, commandName).not.toContain("sessionEpoch?");
    }
    expect(contract.commands.find((command) => command.name === "read_working_tree_diffs")).toEqual({
      name: "read_working_tree_diffs",
      arguments: ["path", "sessionEpoch"],
      response: "WorkingTreeDiffBatch",
    });
    // Session-epoch optionality is semantic or it does not exist: an optional
    // epoch must be exactly the documented exceptions, never a leftover
    // compatibility allowance.
    expect(contract.sessionEpoch.requiredForOpenRepositoryCommands).toBe(true);
    const optionalEpochCommands = contract.commands
      .filter((command) => command.arguments.includes("sessionEpoch?"))
      .map((command) => command.name);
    expect(optionalEpochCommands).toEqual(["open_repository", "get_line_endings"]);
    expect(contract.sessionEpoch.semanticExceptions.map(({ command }) => command)).toEqual(
      optionalEpochCommands,
    );
    for (const exception of contract.sessionEpoch.semanticExceptions) {
      expect(exception.reason.length, exception.command).toBeGreaterThan(0);
    }
    expect(contract.errorCodes).toEqual(APP_ERROR_CODES);
    // The channel is a closed enum between the two compiled feeds; the
    // renderer still cannot hand native code a feed, URL, key or target.
    expect(contract.commands.find((command) => command.name === "set_app_update_channel")).toEqual({
      name: "set_app_update_channel",
      arguments: ["channel"],
      response: "UpdateChannelSetting",
    });
    for (const command of contract.commands.filter(({ name }) => name.endsWith("_app_update") || name.includes("app_update_"))) {
      for (const forbidden of ["url", "feed", "publicKey", "endpoint", "target", "headers"]) {
        expect(command.arguments, command.name).not.toContain(forbidden);
      }
    }
    expect(contract.watchEvent).toEqual({
      name: "repository-changed",
      fields: ["projectId", "sessionEpoch", "sequence", "kind"],
      kinds: ["worktree", "head_or_refs", "shared_repository"],
    });
  });
});
