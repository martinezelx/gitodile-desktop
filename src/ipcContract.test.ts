import { describe, expect, it } from "vitest";
import contract from "../docs/architecture/025-ipc-contract.json";
import { APP_ERROR_CODES } from "./shared/i18n";

describe("IPC contract snapshot", () => {
  it("keeps command names, arguments, response names, errors and watcher payload stable", () => {
    expect(contract.version).toBe(1);
    expect(contract.commands).toHaveLength(37);
    expect(contract.commands.map((command) => command.name)).toEqual([
      "app_status", "show_main_window", "open_repository", "read_working_tree_status",
      "read_file_diff", "read_file_lines", "read_working_tree_diffs", "plan_discard_changes",
      "discard_changes", "get_discard_recovery", "restore_discarded_changes", "git_diagnostics",
      "install_git", "update_git", "check_git_update", "get_git_identity", "set_git_identity",
      "plan_save_version", "save_version", "discover_remotes", "read_team_sync_status",
      "check_team_changes", "list_unpublished_versions",
      "read_commit_file_changes", "read_commit_file_diff", "plan_publish", "publish",
      "get_version_lines", "plan_create_version_line", "create_version_line",
      "plan_switch_version_line", "switch_version_line", "plan_delete_version_line",
      "delete_version_line", "watch_repository", "unwatch_repository", "close_project_session",
    ]);
    expect(contract.commands.find((command) => command.name === "save_version")).toEqual({
      name: "save_version",
      arguments: ["path", "title", "description?", "stateToken", "selectedPaths?", "sessionEpoch"],
      response: "SaveVersionResult",
    });
    for (const commandName of [
      "plan_save_version", "save_version", "read_team_sync_status", "check_team_changes",
      "plan_publish", "publish",
      "plan_create_version_line", "create_version_line", "plan_switch_version_line",
      "switch_version_line", "plan_delete_version_line", "delete_version_line",
      "plan_discard_changes", "discard_changes", "get_discard_recovery", "restore_discarded_changes",
    ]) {
      const command = contract.commands.find(({ name }) => name === commandName);
      expect(command?.arguments, commandName).toContain("sessionEpoch");
      expect(command?.arguments, commandName).not.toContain("sessionEpoch?");
    }
    expect(contract.compatibility.optionalSessionEpochConsumers).toEqual([]);
    expect(contract.errorCodes).toEqual(APP_ERROR_CODES);
    expect(contract.watchEvent).toEqual({
      name: "repository-changed",
      fields: ["projectId", "sessionEpoch", "sequence", "kind"],
      kinds: ["worktree", "head_or_refs", "shared_repository"],
    });
  });
});
